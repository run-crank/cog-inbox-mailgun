import { BaseStep, Field, StepInterface, ExpectedRecord } from '../core/base-step';
import { EOL } from 'os';
import { FieldDefinition, Step, StepDefinition, RecordDefinition } from '../proto/cog_pb';
import { Inbox } from '../models';

/*tslint:disable:no-else-after-return*/
export class EmailCountEqualsStep extends BaseStep implements StepInterface {

  protected stepName: string = 'Check the number of emails received';
  // tslint:disable-next-line:max-line-length
  protected stepExpression: string = 'there should be (?<count>\\d+) emails? in mailgun for (?<email>.+)';
  protected stepType: StepDefinition.Type = StepDefinition.Type.VALIDATION;
  protected actionList: string[] = ['check'];
  protected targetObject: string = 'Email Count';
  protected expectedFields: Field[] = [{
    field: 'email',
    type: FieldDefinition.Type.EMAIL,
    description: 'The inbox\'s email address',
  }, {
    field: 'count',
    type: FieldDefinition.Type.NUMERIC,
    description: 'The number received',
  }];
  protected expectedRecords: ExpectedRecord[] = [{
    id: 'messages',
    type: RecordDefinition.Type.TABLE,
    fields: [{
      field: '#',
      type: FieldDefinition.Type.NUMERIC,
      description: 'Email receipt order number',
    }, {
      field: 'Subject',
      type: FieldDefinition.Type.STRING,
      description: 'Email subject line',
    }, {
      field: 'From',
      type: FieldDefinition.Type.STRING,
      description: 'Email from line',
    }, {
      field: 'To',
      type: FieldDefinition.Type.STRING,
      description: 'Email to line',
    }],
    dynamicFields: false,
  }];

  async executeStep(step: Step) {
    const stepData: any = step.getData() ? step.getData().toJavaScript() : {};

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

      // tslint:disable-next-line:triple-equals
      if (inbox.items.length == 0 && stepData.count != 0) {
        return this.fail('Expected there to be %d emails, but no emails have been received', [
          stepData.count,
        ]);
      }

      const records = this.createRecords(inbox.items);

      // tslint:disable-next-line:triple-equals
      if (inbox.items.length == stepData.count) {
        return this.pass(
          'Found %d emails, as expected',
          [inbox.items.length],
          [records],
        );
      } else {
        return this.fail(
          'Expected there to be %d emails, but there were actually %d.',
          [stepData.count, inbox.items.length],
          [records],
        );
      }

    } catch (e) {
      return this.error('There was a problem checking emails: %s', [e.toString()]);
    }
  }

  createRecords(emails: Record<string, any>[]) {
    const records = [];
    const data = [...emails.reverse()];
    data.forEach((email, i) => {
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

export { EmailCountEqualsStep as Step };
