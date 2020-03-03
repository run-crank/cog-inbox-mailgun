/*tslint:disable:no-else-after-return*/

import { BaseStep, Field, StepInterface, ExpectedRecord } from '../core/base-step';
import { Step, FieldDefinition, StepDefinition, RecordDefinition } from '../proto/cog_pb';
import { Email, Inbox } from '../models';

export class EmailFieldValidationStep extends BaseStep implements StepInterface {
  protected stepName: string = 'Check the content of an email';
  // tslint:disable-next-line:max-line-length
  protected stepExpression: string = 'the (?<field>(subject|body-html|body-plain|from)) of the (?<position>\\d+)(?:(st|nd|rd|th))? mailgun email for (?<email>.+) (?<operator>(should contain|should not contain|should be)) (?<expectation>.+)';
  protected stepType: StepDefinition.Type = StepDefinition.Type.VALIDATION;
  protected expectedFields: Field[] = [{
    field: 'email',
    type: FieldDefinition.Type.EMAIL,
    description: 'The inbox\'s email address',
  }, {
    field: 'position',
    type: FieldDefinition.Type.NUMERIC,
    description: 'The nth message to check from the email\'s inbox',
  }, {
    field: 'field',
    type: FieldDefinition.Type.STRING,
    description: 'Field name to check',
  }, {
    field: 'operator',
    type: FieldDefinition.Type.STRING,
    description: 'The operator to use when performing the validation. Current supported values are: should contain, should not contain, and should be',
  }, {
    field: 'expectation',
    type: FieldDefinition.Type.ANYSCALAR,
    description: 'Expected field value',
  }];
  protected expectedRecords: ExpectedRecord[] = [{
    id: 'eml',
    type: RecordDefinition.Type.BINARY,
  }];

  async executeStep(step: Step) {
    const stepData: any = step.getData() ? step.getData().toJavaScript() : {};
    const expectation = stepData.expectation;
    const field = stepData.field;
    // tslint:disable-next-line:radix
    const position = parseInt(stepData.position) || 1;
    const operator = stepData.operator;

    try {
      const domain: string = stepData.email.split('@')[1];
      const authDomain: string = this.client.auth.get('domain').toString();

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

      const storageUrl: string = inbox.items.reverse()[position - 1].storage.url;
      let record;

      if (inbox.items.length > 1) {
        record = this.createRecords(inbox.items);
      } else {
        const rawMessage = await this.client.getRawMimeMessage(storageUrl);
        // tslint:disable-next-line:max-line-length
        record = this.binary('eml', 'Email Message', 'text/eml', Buffer.from(rawMessage['body-mime']).toString('base64'));
      }

      if (!inbox.items[position - 1]) {
        return this.error(
          'Email #%d hasn\'t been received yet: there are %d message(s) in the inbox.',
          [position, inbox.items.length],
          [record],
        );
      }

      const email: Email = await this.client.getEmailByStorageUrl(storageUrl);

      if (email === null || !email) {
        return this.error(
          'There was a problem reading email #%d: email found but couldn\'t be read from storage.',
          [position],
          [record],
        );
      }

      if (this.executeComparison(expectation, email[field], operator)) {
        return this.pass(
          'Check on email %s passed: %s %s "%s"',
          [field, field, operator, expectation],
          [record],
        );
      } else {
        return this.fail(
          'Check on email %s failed: %s %s "%s", but it was actually %s',
          [field, field, operator, expectation, email[field]],
          [record],
        );
      }
    } catch (e) {
      return this.error('There was a problem checking email messages: %s', [e.toString()]);
    }
  }

  executeComparison(expected: string, actual: string, operator: string): boolean {
    let result: boolean = false;
    if (actual === undefined) {
      return false;
    }

    if (operator === 'should be') {
      result = expected === actual;
    } else if (operator === 'should contain') {
      result = actual.toLowerCase().includes(expected.toLowerCase());
    } else if (operator === 'should not contain') {
      result = !actual.toLowerCase().includes(expected.toLowerCase());
    }

    return result;
  }

  createRecords(emails: Record<string, any>[]) {
    const records = [];
    emails.forEach((email, i) => {
      records.push({
        '#': i + 1,
        Subject: email.message.headers.subject,
        From: email.message.headers.from,
        To: email.message.headers.to,
      });
    });

    const headers = {
      '#': '#',
      Subject: 'Subject',
      From: 'From',
      To: 'To',
    };
    return this.table('messages', 'Received Email Messages', headers, records);
  }
}

export { EmailFieldValidationStep as Step };
