import { IHTTPIngressPath, IIngressRule, IResource } from "shared/types";
import { GetURLItemFromIngress, IsURL } from "./AccessURLIngressHelper";

describe("GetURLItemFromIngress", () => {
  interface ITest {
    description: string;
    hosts?: string[];
    paths?: IHTTPIngressPath[];
    tlsHosts?: string[];
    expectedURLs: string[];
    status?: any;
    backend?: any;
  }
  const tests: ITest[] = [
    {
      description: "it should show the host without port",
      hosts: ["foo.bar"],
      paths: [],
      tlsHosts: [],
      expectedURLs: ["http://foo.bar"],
    },
    {
      description: "it should show several hosts without port",
      hosts: ["foo.bar", "not-foo.bar"],
      paths: [],
      tlsHosts: [],
      expectedURLs: ["http://foo.bar", "http://not-foo.bar"],
    },
    {
      description: "it should show the host with the different paths",
      hosts: ["foo.bar"],
      paths: [{ path: "/one" }, { path: "/two" }],
      tlsHosts: [],
      expectedURLs: ["http://foo.bar/one", "http://foo.bar/two"],
    },
    {
      description: "it should show TLS hosts with https",
      hosts: ["foo.bar", "not-foo.bar"],
      paths: [],
      tlsHosts: ["foo.bar"],
      expectedURLs: ["https://foo.bar", "http://not-foo.bar"],
    },
    {
      description: "it should ignore an ingress if it has no hosts",
      hosts: undefined,
      paths: [],
      tlsHosts: ["foo.bar"],
      expectedURLs: [],
    },
    {
      description: "it should ignore paths if undefined",
      hosts: ["foo.bar"],
      paths: undefined,
      tlsHosts: [],
      expectedURLs: ["http://foo.bar"],
    },
    {
      description: "it should ignore TLS if the hosts are undefined",
      hosts: ["foo.bar"],
      paths: [],
      tlsHosts: undefined,
      expectedURLs: ["http://foo.bar"],
    },
    {
      description: "it should add an ingress with a default backend",
      status: {
        loadBalancer: {
          ingress: [{ ip: "1.2.3.4" }],
        },
      },
      backend: {},
      expectedURLs: ["http://1.2.3.4"],
    },
  ];
  tests.forEach(test => {
    it(test.description, () => {
      const ingress = {
        metadata: {
          name: "foo",
        },
        spec: {
          backend: test.backend,
        },
        status: test.status,
      } as IResource;
      if (test.hosts) {
        ingress.spec.rules = [];
        test.hosts.forEach(h => {
          const rule = {
            host: h,
            http: {
              paths: [],
            },
          } as IIngressRule;
          if (test.paths && test.paths.length > 0) {
            rule.http.paths = test.paths;
          }
          ingress.spec.rules.push(rule);
        });
      }
      if (test.tlsHosts && test.tlsHosts.length > 0) {
        ingress.spec.tls = [
          {
            hosts: test.tlsHosts,
          },
        ];
      }
      const ingressItem = GetURLItemFromIngress(ingress);
      expect(ingressItem.isLink).toBe(true);
      expect(ingressItem.URLs).toEqual(test.expectedURLs);
    });
  });
});

describe("IsURL", () => {
  interface ITest {
    description: string;
    fullURL: string;
    expected: boolean;
  }
  const tests: ITest[] = [
    {
      description: "it should return true to a simple url",
      fullURL: "http://wordpress.local/example-test",
      expected: true,
    },
    {
      description: "it should return false to a 'rfc-ilegal' url with a regex",
      fullURL: "http://wordpress.local/example-bad(/|$)(.*)",
      expected: false,
    },
    {
      description: "it should return false to a 'rfc-legal' url with a regex",
      fullURL: "http://wordpress.local/example-bad/[a-z]+",
      expected: false,
    },
    {
      description: "it should return true to a simple url (https)",
      fullURL: "https://wordpress.local/example-test",
      expected: true,
    },
    {
      description: "it should return false to a 'rfc-ilegal' url with a regex (https)",
      fullURL: "https://wordpress.local/example-bad(/|$)(.*)",
      expected: false,
    },
    {
      description: "it should return false to a 'rfc-legal' url with a regex (https)",
      fullURL: "https://wordpress.local/example-bad/[a-z]+",
      expected: false,
    },
    {
      description: "it should return true to a simple url (host is ip)",
      fullURL: "http://1.1.1.1/example-test",
      expected: true,
    },
    {
      description: "it should return false to a 'rfc-ilegal' url with a regex (host is ip)",
      fullURL: "http://1.1.1.1/example-bad(/|$)(.*)",
      expected: false,
    },
    {
      description: "it should return false to a 'rfc-legal' url with a regex (host is ip)",
      fullURL: "http://1.1.1.1/example-bad/[a-z]+",
      expected: false,
    },
    {
      description: "it should return false to a 'rfc-legal' url with a regex",
      fullURL: "http://wordpress.local/example-bad/*",
      expected: false,
    },
    {
      description: "it should return true to a translated idn url",
      fullURL: "http://wordpress.local/example-good/xn--kgbechtv",
      expected: true,
    },
    {
      description: "it should return true to a translated idn url (path)",
      fullURL: "http://wordpress.local/example-good/xn--kgbechtv",
      expected: true,
    },
    {
      description: "it should return true to a translated idn url (host)",
      fullURL: "http://wordpress.xn--kgbechtv/example-good",
      expected: true,
    },
    {
      description: "it should return false to a non-translated idn url",
      fullURL: "http://wordpress.local/♨️/shouldBeIDNTranslated",
      expected: false,
    },
  ];
  tests.forEach(test => {
    it(test.fullURL, () => {
      const isURL = IsURL(test.fullURL);
      expect(isURL).toBe(test.expected);
    });
  });
});
