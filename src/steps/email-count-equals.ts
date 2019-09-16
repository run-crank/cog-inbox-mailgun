import { BaseStep, Field, StepInterface } from '../core/base-step';
import { EOL } from 'os';
import { FieldDefinition, Step, StepDefinition } from '../proto/cog_pb';
import { Inbox } from '../models';

/*tslint:disable:no-else-after-return*/
export class EmailCountEqualsStep extends BaseStep implements StepInterface {

  protected stepName: string = 'Check the email count on a Mailgun Inbox';
  // tslint:disable-next-line:max-line-length
  protected stepExpression: string = 'there should be (?<count>\\d+) emails in mailgun for (?<email>.+)';
  protected stepType: StepDefinition.Type = StepDefinition.Type.VALIDATION;
  protected expectedFields: Field[] = [{
    field: 'email',
    type: FieldDefinition.Type.EMAIL,
    description: 'The inbox\'s email address',
  }, {
    field: 'count',
    type: FieldDefinition.Type.NUMERIC,
    description: 'The email count',
  }];

  async executeStep(step: Step) {
    const stepData: any = step.getData() ? step.getData().toJavaScript() : {};

    try {
      const domain: string = stepData.email.split('@')[1];
      const authDomain: string = this.client.auth.get('domain').toString();

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

      // tslint:disable-next-line:triple-equals
      if (inbox.items.length == 0) {
        return this.fail('Expected there to be %s emails, but no emails have been received', [
          stepData.count,
        ]);
      }

      // tslint:disable-next-line:triple-equals
      if (inbox.items.length == stepData.count) {
        return this.pass('Found %s emails, as expected', [
          inbox.items.length,
        ]);
      } else {
        return this.fail('Expected there to be %s emails, but there were actually %s. Their subjects are: %s', [
          stepData.count,
          inbox.items.length,
          inbox.items.map(f => f['message']['headers']['subject']).join(EOL),
        ]);
      }

    } catch (e) {
      return this.error('There was an error retrieving email messages: %s', [e.toString()]);
    }
  }
}

export { EmailCountEqualsStep as Step };
