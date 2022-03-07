/*tslint:disable:no-else-after-return*/

import { BaseStep, Field, StepInterface, ExpectedRecord } from '../core/base-step';
import { Step, FieldDefinition, StepDefinition, RecordDefinition } from '../proto/cog_pb';

export class SendValidationEmailStep extends BaseStep implements StepInterface {
  protected stepName: string = 'Send a validation email';
  // tslint:disable-next-line:max-line-length
  protected stepExpression: string = 'Send a validation email to (?<email>[^\\s]+)';
  protected stepType: StepDefinition.Type = StepDefinition.Type.ACTION;
  protected expectedFields: Field[] = [{
    field: 'email',
    type: FieldDefinition.Type.EMAIL,
    description: 'The inbox\'s email address',
  }, {
    field: 'validation',
    type: FieldDefinition.Type.STRING,
    description: 'What would you like to ask to be validated?',
  }];
  protected expectedRecords: ExpectedRecord[] = [];

  async executeStep(step: Step) {
    const stepData: any = step.getData() ? step.getData().toJavaScript() : {};
    const email = stepData.email;
    const validation = stepData.validation;

    try {
      // Make sure that the manual validation data is created before sending the email
      await this.client.createValidationEmail(email, validation);
      await this.client.sendValidationEmail(email, 'StackMoxie: Scenario Validation');

      return this.pass(`Validation email was successfully sent to %s`, [email]);
    } catch (e) {
      if (e.response && e.response.data) {
        return this.error('There was a problem sending a validation email: %s', [e.response.data.message]);
      }
      return this.error('There was a problem sending a validation email: %s', [e.toString()]);
    }
  }
}

export { SendValidationEmailStep as Step };
