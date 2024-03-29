/*tslint:disable:no-else-after-return*/

import { BaseStep, Field, StepInterface, ExpectedRecord } from '../core/base-step';
import { Step, FieldDefinition, StepDefinition, RecordDefinition } from '../proto/cog_pb';

export class CheckValidationEmailStep extends BaseStep implements StepInterface {
  protected stepName: string = 'Check a validation email';
  // tslint:disable-next-line:max-line-length
  protected stepExpression: string = 'Check validation email';
  protected stepType: StepDefinition.Type = StepDefinition.Type.VALIDATION;
  protected actionList: string[] = ['check'];
  protected targetObject: string = 'Human Approval';
  protected expectedFields: Field[] = [];
  protected expectedRecords: ExpectedRecord[] = [];

  async executeStep(step: Step) {
    try {
      const validationEmail = await this.client.getValidationEmail();

      if (validationEmail.testApproved === null) {
        return this.error('There was no response recieved from %s', [validationEmail.emailAddress]);
      }

      if (validationEmail.testApproved) {
        return this.pass('Validation email was evaluated as passing by %s', [validationEmail.emailAddress]);
      } else {
        return this.fail('Validation email was evaluated as failed by %s', [validationEmail.emailAddress]);
      }
    } catch (e) {
      return this.error('There was a problem retrieving validation response: %s', [e.toString()]);
    }
  }
}

export { CheckValidationEmailStep as Step };
