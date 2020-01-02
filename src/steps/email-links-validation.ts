import { BaseStep, Field, StepInterface } from '../core/base-step';
import { FieldDefinition, Step, StepDefinition } from '../proto/cog_pb';
import { Inbox } from '../models';

import * as DomParser from 'dom-parser';
import * as GetUrls from 'get-urls';
import * as os from 'os';

const nl = os.EOL;

/*tslint:disable:no-else-after-return*/
export class EmailLinksValidationStep extends BaseStep implements StepInterface {

  protected stepName: string = 'Check that no link in an email is broken';
  // tslint:disable-next-line:max-line-length
  protected stepExpression: string = 'the (?<position>\\d+)(?:(st|nd|rd|th))? mailgun email for (?<email>.+) should not contain broken links';
  protected stepType: StepDefinition.Type = StepDefinition.Type.VALIDATION;
  protected expectedFields: Field[] = [{
    field: 'email',
    type: FieldDefinition.Type.EMAIL,
    description: 'The inbox\'s email address',
  }, {
    field: 'position',
    type: FieldDefinition.Type.NUMERIC,
    description: 'The nth message to check from the email\'s inbox',
  }];

  async executeStep(step: Step) {
    const stepData: any = step.getData() ? step.getData().toJavaScript() : {};

    try {
      const domain: string = stepData.email.split('@')[1];
      const authDomain: string = this.client.auth.get('domain').toString();
      const position: number = stepData.position;

      if (domain !== authDomain) {
        return this.error("Couldn't check %s's email: Only addresses with the %s domain can be checked.", [
          stepData.email,
          authDomain,
        ]);
      }

      const inbox: Inbox = await this.client.getInbox(stepData.email);

      if (!inbox || inbox === null) {
        return this.error("There was a problem checking %s's email: no inbox found.", [
          stepData.email,
        ]);
      }

      if (inbox['message']) {
        return this.error("There was a problem checking %s's email: %s", [
          stepData.email,
          inbox['message'],
        ]);
      }

      if (!inbox.items[position - 1]) {
        return this.error("Email #%d hasn't been received yet: there are %d message(s) in the inbox.", [
          position,
          inbox.items.length,
        ]);
      }

      const storageUrl: string = inbox.items.reverse()[position - 1].storage.url;
      const email: Record<string, any> = await this.client.getEmailByStorageUrl(storageUrl);

      if (email === null || !email) {
        return this.error("There was a problem reading email #%d: email found but couldn't be read from storage.", [
          position,
        ]);
      }

      const htmlBody: string = email['body-html'] || '';
      const plain: string = email['body-plain'] || '';

      const parser = new DomParser();
      const dom = parser.parseFromString(htmlBody);

      const htmlUrls = dom.getElementsByTagName('a')
                      .map((f) => { return { url: f.getAttribute('href'), type: 'HTML' }; })
                      .filter(f => f.url.includes('http'));

      const plainUrls = Array.from(GetUrls(plain).values()).map((f) => { return { url: f, type: 'Plain' }; });

      const urls = new Set(htmlUrls.concat(plainUrls));

      const response = await this.client.evaluateUrls(
        this.sanitizeUrl(Array.from(urls.values())));

      if (response.length > 0) {
        const plain = response.filter(f => f.type === 'Plain');
        const html = response.filter(f => f.type === 'HTML');
        return this.fail('Broken links were found in the email. URLs include: %s%s%s%s%s', [
          `${nl}`,
          `${nl}Plain Text: ${nl}`,
          plain.length > 0 ? plain.map(f => `${f.url} (${f.message})`.trim()).join(`${nl}`) : `No URLs found in Plain Text Body${nl}`,
          `${nl}${nl}HTML: ${nl}`,
          html.length > 0 ? html.map(f => `${f.url} (${f.message})`.trim()).join(`${nl}`) : `No URLS found in HTML Body${nl}`,
        ]);
      }

      return this.pass("No broken links were found in email #%d in %s's inbox", [
        position,
        stepData.email,
      ]);
    } catch (e) {
      return this.error("There was a problem checking links in email #%d in %s's inbox: %s", [
        stepData.position,
        stepData.email,
        e.toString(),
      ]);
    }
  }

  private sanitizeUrl(urls): string[] {
    if (!urls) {
      return;
    }

    return urls.filter(f => !f.url.includes('%3E'));
  }
}

export { EmailLinksValidationStep as Step };
