# Inbox (Mailgun) Cog

[![CircleCI](https://circleci.com/gh/run-crank/cog-inbox-mailgun/tree/master.svg?style=svg)](https://circleci.com/gh/run-crank/cog-inbox-mailgun/tree/master)

This is a [Crank][what-is-crank] Cog for validating receipt and contents of
emails. Use it in combination with other Cogs to validate that SaaS systems are
sending the right emails with the right contents/personalization, in the right
amount of time. Common use-cases include welcome emails, confirmation emails,
and nurture/drip emails, triggered by configurations or activity on web forms,
automation platforms, CRMs, etc.

In order to make use of this Cog, you will need a (paid) Mailgun account,
configured as described below in the Setup section.

* [Installation](#installation)
* [Setup](#setup)
* [Usage](#usage)
* [Development and Contributing](#development-and-contributing)

## Installation

Ensure you have the `crank` CLI and `docker` installed and running locally,
then run the following.  You'll be prompted to enter your Mailgun API
credentials once the Cog is successfully installed.

```shell-session
$ crank cog:install stackmoxie/inbox-mailgun --ignore-auth
```

## Setup

This Cog leverages Mailgun's email receiving and storage capabilities to make
assertions about the subject, body (HTML and plain text) and from lines of
emails sent to a domain configured for use with Mailgun.

**Prerequisites**:
- A domain or subdomain whose DNS records you can access/modify,
- A [Mailgun account][sign-up-for-mailgun] (~~free/trial version will work~~
  ~~for most use-cases~~ as of March 2020, you'll need a plan that includes
  log and message retention; a Foundation plan, starting at $35/mo, is the
  least expensive, suitable option available),

1. First, configure MX records for your domain or subdomain so that Mailgun is
   the system used to receive emails. Follow [Mailgun's directions here][mailgun-mx]
   to configure DNS correctly. As noted, take care not to remove any existing
   MX records (e.g. for Google Mail). We recommend using a custom subdomain
   just for this Cog, e.g. `crank-tests.example.com`.
2. Once configured, set up a Route in your Mailgun dashboard (under [Receiving][mailgun-app-routes])
   with a custom expression type with the following value:
   `match_recipient(".*@crank-tests\.example\.com")`, where you replace
   `crank-tests.example.com` with the domain you configured above.
3. When creating the custom Route, check the `Store and notify` box, to ensure
   Mailgun stores all messages matching the route. You do not need to specify a
   notification URL.
4. Give the Route a useful description, e.g. `Captures Crank emails for testing`.

You can verify that everything was configured correctly by sending an email to
`cog-setup-test@crank-tests.example.com` (again, using the domain from above)
from your personal email address, and looking for a corresponding `stored` log
message in your Mailgun dashboard under `Sending -> Logs`.

Finally, return to your CLI to authenticate the Cog:

```shell-session
$ crank cog:auth stackmoxie/inbox-mailgun
```

For details on where to find authentication information, see the Authentication
section below.

## Usage

### Authentication

<!-- run `crank cog:readme stackmoxie/inbox-mailgun` to update -->
<!-- authenticationDetails -->
You will be asked for the following authentication details on installation. To avoid prompts in a CI/CD context, you can provide the same details as environment variables.

| Field | Install-Time Environment Variable | Description |
| --- | --- | --- |
| **apiKey** | `CRANK_AUTOMATONINC_INBOX_MAILGUN__APIKEY` | Mailgun API Key |
| **domain** | `CRANK_AUTOMATONINC_INBOX_MAILGUN__DOMAIN` | Email Domain |
| **endpoint** | `CRANK_AUTOMATONINC_INBOX_MAILGUN__ENDPOINT` | Mailgun API Endpoint |

```shell-session
# Re-authenticate by running this
$ crank cog:auth stackmoxie/inbox-mailgun
```
<!-- authenticationDetailsEnd -->

Note:
- Your `Mailgun API Key` can be found on the [API security page][mailgun-api-key],
- Your `Email Domain` is the domain or subdomain configured for use with
  Mailgun (e.g. `crank-tests.example.com`),
- Your `Mailgun API Endpoint` will most likely be `https://api.mailgun.net/v3`,
  unless you're using Mailgun's EU data center, in which case it will be
  `https://api.eu.mailgun.net/v3`.

### Steps
Once installed, the following steps will be available for use in any of your
Scenario files.

<!-- run `crank cog:readme stackmoxie/inbox-mailgun` to update -->
<!-- stepDetails -->
| Name (ID) | Expression | Expected Data |
| --- | --- | --- |
| **Check the number of emails received**<br>(`EmailCountEqualsStep`) | `there should be (?<count>\d+) emails? in mailgun for (?<email>.+)` | - `email`: The inbox's email address <br><br>- `count`: The number received |
| **Check the content of an email**<br>(`EmailFieldValidationStep`) | `the (?<field>(subject\|body-html\|body-plain\|from)) of the (?<position>\d+)(?:(st\|nd\|rd\|th))? mailgun email for (?<email>[^\s]+) (?<operator>(should contain\|should not contain\|should be)) (?<expectation>.+)` | - `email`: The inbox's email address <br><br>- `position`: The nth message to check from the email's inbox <br><br>- `field`: Field name to check <br><br>- `operator`: The operator to use when performing the validation. Current supported values are: should contain, should not contain, and should be <br><br>- `expectation`: Expected field value |
| **Check that no link in an email is broken**<br>(`EmailLinksValidationStep`) | `the (?<position>\d+)(?:(st\|nd\|rd\|th))? mailgun email for (?<email>.+) should not contain broken links` | - `email`: The inbox's email address <br><br>- `position`: The nth message to check from the email's inbox |
<!-- stepDetailsEnd -->

## Development and Contributing
Pull requests are welcome. For major changes, please open an issue first to
discuss what you would like to change. Please make sure to add or update tests
as appropriate.

### Setup

1. Install node.js (v12.x+ recommended)
2. Clone this repository.
3. Install dependencies via `npm install`
4. Run `npm start` to validate the Cog works locally (`ctrl+c` to kill it)
5. Run `crank cog:install --source=local --local-start-command="npm start"` to
   register your local instance of this Cog. You may need to append a `--force`
   flag or run `crank cog:uninstall stackmoxie/inbox-mailgun` if you've already
   installed the distributed version of this Cog.

### Adding/Modifying Steps
Modify code in `src/steps` and validate your changes by running
`crank cog:step stackmoxie/inbox-mailgun` and selecting your step.

To add new steps, create new step classes in `src/steps`. Use existing steps as
a starting point for your new step(s). Note that you will need to run
`crank registry:rebuild` in order for your new steps to be recognized.

Always add tests for your steps in the `test/steps` folder. Use existing tests
as a guide.

### Modifying the API Client or Authentication Details
Modify the ClientWrapper class at `src/client/client-wrapper.ts`.

- If you need to add or modify authentication details, see the
  `expectedAuthFields` static property.
- If you need to expose additional logic from the wrapped API client, add a new
  ublic method to the wrapper class, which can then be called in any step.
- It's also possible to swap out the wrapped API client completely. You should
  only have to modify code within this clase to achieve that.

Note that you will need to run `crank registry:rebuild` in order for any
changes to authentication fields to be reflected. Afterward, you can
re-authenticate this Cog by running `crank cog:auth stackmoxie/inbox-mailgun`

### Tests and Housekeeping
Tests can be found in the `test` directory and run like this: `npm test`.
Ensure your code meets standards by running `npm run lint`.

[what-is-crank]: https://crank.run?utm_medium=readme&utm_source=automatoninc%2Finbox-mailgun
[sign-up-for-mailgun]: https://signup.mailgun.com/new/signup?utm_source=automaton
[mailgun-mx]: https://documentation.mailgun.com/en/latest/quickstart-receiving.html#how-to-start-receiving-inbound-email
[mailgun-app-routes]: https://app.mailgun.com/app/receiving/routes
[mailgun-api-key]: https://app.mailgun.com/app/account/security/api_keys
