use std::convert::Infallible;

use anyhow::Error;
use hyper::{Body, Request, Response, StatusCode};
use log::{error, info};
use native_tls::TlsConnector;

use crate::logging;
use crate::https;

/// The proxy service accepts a request and returns the proxied response from the api server.
///
/// The request must include an authorization token which is exchanged with pinniped-concierge
/// for an X509 client identity cert with which the request is forwarded on.
pub async fn proxy(mut req: Request<Body>) -> Result<Response<Body>, Infallible> {

    let mut log_data = logging::request_log_data(&req);
    let k8s_api_server_url = match https::get_api_server_url(req.headers()) {
        Ok(u) => u,
        Err(e) => return handle_error(e, StatusCode::BAD_REQUEST, log_data),
    };
    req = match https::rewrite_request(req, k8s_api_server_url.clone()) {
        Ok(r) => r,
        Err(e) => return handle_error(e, StatusCode::BAD_REQUEST, log_data),
    };

    // Recreate the log data now that the request host has been rewritten.
    log_data = logging::request_log_data(&req);

    // TODO: don't call this if we're using https://kubernetes.local, instead
    // grab the data from the file system.
    let cert_auth_data = match https::get_api_server_cert_auth_data(req.headers()) {
        Ok(c) => c,
        Err(e) => return handle_error(e, StatusCode::BAD_REQUEST, log_data),
    };
    let k8s_api_cert = match https::cert_for_cert_data(cert_auth_data.clone()) {
        Ok(c) => c,
        Err(e) => return handle_error(e, StatusCode::BAD_REQUEST, log_data),
    };

    // Create an https client with which to proxy the request.
    // We need to construct the TlsConnector for each request so that we can set
    // the client cert. It'd be nice if we could do the construction once and just
    // clone to add the client cert?
    let mut tls_builder = &mut TlsConnector::builder();
    // Ensure we can talk to the k8s api server via TLS by setting the api server cert.
    tls_builder = tls_builder.add_root_certificate(k8s_api_cert.clone());
    // Ensure the user is authenticated by exchanging the header authz token for a client identity X509 cert.
    tls_builder = match https::include_client_identity_for_headers(tls_builder, req.headers().clone(), &k8s_api_server_url, &cert_auth_data).await {
        Ok(b) => b,
        Err(e) => return handle_error(e, StatusCode::INTERNAL_SERVER_ERROR, log_data),
    };

    let client = match https::make_https_client(tls_builder) {
        Ok(c) => c,
        Err(e) => return handle_error(e, StatusCode::INTERNAL_SERVER_ERROR, log_data),
    };

    match client.request(req).await {
        Ok(r) => {
            info!("{}", logging::response_log_data(&r, log_data));
            Ok(r)
        },
        Err(e) => return handle_error(anyhow::anyhow!(e), StatusCode::INTERNAL_SERVER_ERROR, log_data),
    }
}

/// handle_error converts an error into an http response.
fn handle_error(e: Error, status: StatusCode, log_data: logging::LogData) -> Result<Response<Body>, Infallible> {
    let response = match Response::builder()
        .status(status)
        .body(Body::from(e.to_string())) {
            Ok(r) => r,
            Err(e) => {
                error!("{}", e);
                Response::builder().status(status).body(Body::empty()).unwrap()
            }
        };
    error!("{:?}", e);
    info!("{}", logging::response_log_data(&response, log_data));
    Ok(response)
}
