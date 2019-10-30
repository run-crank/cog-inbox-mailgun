import { BaseStep, Field, StepInterface } from '../core/base-step';
import { FieldDefinition, Step, StepDefinition } from '../proto/cog_pb';
import { Inbox } from '../models';

import * as DomParser from 'dom-parser';
import * as RequestPromise from 'request-promise';

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

      const htmlBody = email['body-html'];
      const plain = email['body-plain'];

      const parser = new DomParser();
      const dom = parser.parseFromString(htmlBody);
      const urls = dom.getElementsByTagName('a')
                      .map(f => f.getAttribute('href'))
                      .filter(f => f.includes('http'));

      await this.client.evaluateUrls(urls);

      return this.pass('No broken links were found for email %s in position %s', [
        stepData.email,
        position,
      ]);
    } catch (e) {
      return this.error('Broken links found: %s', [e.toString()]);
    }
  }
}

export { EmailLinksValidationStep as Step };
