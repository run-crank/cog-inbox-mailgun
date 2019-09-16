import { BaseStep, Field, StepInterface } from '../core/base-step';
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
      if (inbox.items.length == stepData.count) {
        return this.pass('Found %s emails, as expected', [
          inbox.items.length,
        ]);
      } else {
        return this.fail('Expected %s to be %s, but it was actually %s', [
          inbox.items.length,
          stepData.count,
          inbox.items.length,
        ]);
      }

    } catch (e) {
      return this.error('There was an error reaching mailgun: %s', [e.toString()]);
    }
  }
}

export { EmailCountEqualsStep as Step };
