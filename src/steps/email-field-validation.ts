/*tslint:disable:no-else-after-return*/

import { BaseStep, Field, StepInterface } from '../core/base-step';
import { Step, FieldDefinition, StepDefinition } from '../proto/cog_pb';
import { Email, Inbox } from '../models';

export class EmailFieldValidationStep extends BaseStep implements StepInterface {
  private operators: string[] = ['should contain', 'should not contain', 'should be'];

  protected stepName: string = 'Validate a field on a Mailgun Email';
  // tslint:disable-next-line:max-line-length
  protected stepExpression: string = 'the (?<field>(subject|body|from)) of the (?<position>\d+)(?:(st|nd|rd|th))? mailgun email for (?<email>.+) (?<operator>(should contain|should not contain|should be)) (?<expectation>.+)';
  protected stepType: StepDefinition.Type = StepDefinition.Type.VALIDATION;
  protected expectedFields: Field[] = [{
    field: 'email',
    type: FieldDefinition.Type.EMAIL,
    description: 'The inbox\'s email address',
  }, {
    field: 'field',
    type: FieldDefinition.Type.STRING,
    description: 'Field name to check',
  }, {
    field: 'expectation',
    type: FieldDefinition.Type.ANYSCALAR,
    description: 'Expected field value',
  }, {
    field: 'position',
    type: FieldDefinition.Type.NUMERIC,
    description: 'The nth message to check from the email\'s inbox',
  }, {
    field: 'operator',
    type: FieldDefinition.Type.STRING,
    description: 'The operator to use when performing the validation. Current supported values are: should contain, should not contain, and should be',
  }];

  async executeStep(step: Step) {
    const stepData: any = step.getData() ? step.getData().toJavaScript() : {};
    const expectation = stepData.expectation;
    const field = stepData.field;
    const position = stepData.position || 1;
    const operator = stepData.operator;

    try {
      const inbox: Inbox = await this.client.getInbox(stepData.email);

      if (!inbox || inbox === null) {
        return this.error('Cannot fetch inbox for: %s', [
          stepData.email,
        ]);
      }

      if (!inbox.items[position - 1]) {
        return this.error('Cannot fetch email in position: %s', [
          position,
        ]);
      }

      const storageUrl: string = inbox.items[position - 1].storage.url;
      const email: Email = await this.client.getEmailByStorageUrl(storageUrl);

      if (email === null || !email) {
        return this.error('Cannot fetch email in position: %s', [
          position,
        ]);
      }

      if (this.executeComparison(expectation, email[field], operator)) {
        return this.pass('Expected value %s %s %s', [
          expectation,
          operator,
          email[field],
        ]);
      } else {
        return this.fail('Comparison failed using: %s operator. Actual: %s Expected: %s', [
          operator,
          email[field],
          expectation,
        ]);
      }
    } catch (e) {
      console.log(e.toString());
      return this.error('There was an error reaching mailgun: %s', [e.toString()]);
    }
  }

  executeComparison(expected: string, actual: string, operator: string): boolean {
    let result: boolean = false;

    if (operator === 'should be') {
      result = expected === actual;
    } else if (operator === 'should contain') {
      result = actual.toLowerCase().includes(expected.toLowerCase());
    } else if (operator === 'should not contain') {
      result = !actual.toLowerCase().includes(expected.toLowerCase());
    }

    return result;
  }
}

export { EmailFieldValidationStep as Step };
