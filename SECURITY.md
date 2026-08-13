# Security Policy

## Supported Versions

Security fixes are applied to the latest version on the `main` branch until tagged releases establish a version support policy.

## Reporting a Vulnerability

Do not report suspected vulnerabilities through a public GitHub issue.

Use the repository's private vulnerability reporting form in the **Security** tab. Reports should include:

- the affected `skilldrift` version or commit;
- the operating system and Node.js version;
- minimal reproduction steps;
- the expected and actual behavior; and
- an assessment of whether local skill content, paths, or index data could be exposed or modified.

Do not include private skill contents, access tokens, credentials, or unredacted home-directory paths unless they are necessary for a private report.

Maintainers will acknowledge a valid report, investigate it, and coordinate disclosure and remediation through the private report.

## Scope

Relevant reports include vulnerabilities in local path handling, index persistence, parsing untrusted skill files, dependency behavior, command invocation, and package distribution. General adapter-discovery defects without a security impact belong in the normal issue tracker.
