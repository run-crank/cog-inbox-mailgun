import { BaseStep, Field, StepInterface } from '../core/base-step';
import { FieldDefinition, Step, StepDefinition } from '../proto/cog_pb';
import { Inbox } from '../models';

import * as DomParser from 'dom-parser';
import * as GetUrls from 'get-urls';

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
        return this.error('Can\'t check inbox for %s: email domain doesn\'t match %s', [
          stepData.email,
          authDomain,
        ]);
      }

      const inbox: Inbox = await this.client.getInbox(stepData.email);

      if (!inbox || inbox === null) {
        return this.error('Cannot fetch inbox for: %s', [
          stepData.email,
        ]);
      }

      if (inbox['message']) {
        return this.error(inbox['message']);
      }

      if (!inbox.items[position - 1]) {
        return this.error('Cannot fetch email in position: %s', [
          position,
        ]);
      }

      const storageUrl: string = inbox.items.reverse()[position - 1].storage.url;
      const email: Record<string, any> = await this.client.getEmailByStorageUrl(storageUrl);

      if (email === null || !email) {
        return this.error('Cannot fetch email in position: %s', [
          position,
        ]);
      }

      const htmlBody: string = email['body-html'];
      const plain: string = email['body-plain'];

      const parser = new DomParser();
      const dom = parser.parseFromString(htmlBody);

      const htmlUrls = dom.getElementsByTagName('a')
                      .map(f => f.getAttribute('href'))
                      .filter(f => f.includes('http'));
      const plainUrls = Array.from(GetUrls(plain).values());

      const urls = new Set(htmlUrls.concat(plainUrls));

      const brokenUrls = await this.client.evaluateUrls(
        this.sanitizeUrl(Array.from(urls.values())));

      if (brokenUrls.length > 0) {
        return this.fail('Broken links found in the email. URLs include: %s', [
          brokenUrls.join(', '),
        ]);
      }

      return this.pass('No broken links were found for email %s in position %s', [
        stepData.email,
        position,
      ]);
    } catch (e) {
      return this.error('There was a problem checking links in email number %d for email %s: %s', [
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

    return urls.filter(f => !f.includes('%3E'));
  }
}

export { EmailLinksValidationStep as Step };
