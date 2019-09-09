/*tslint:disable:no-else-after-return*/

import { BaseStep, Field, StepInterface } from '../core/base-step';
import { Step, FieldDefinition, StepDefinition } from '../proto/cog_pb';
import { Email, Inbox } from '../models';

export class EmailFieldValidation extends BaseStep implements StepInterface {
  private operators: string[] = ['Is Exactly', 'Contains', 'Does not Contain'];

  protected stepName: string = 'Check a field on a Mailgun Email';
  // tslint:disable-next-line:max-line-length
  protected stepExpression: string = 'the (?<field>[a-zA-Z0-9_-]+) field of the email in position (?<position>[a-zA-Z0-9_-]+) from the inbox of (?<email>.+), (?<operator>.+) "(?<expectation>.+)"';
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
    description: 'The operator to use when performing the validation. Supported values are: Is Exactly, Contains, Does not Contain',
  }];

  async executeStep(step: Step) {
    const stepData: any = step.getData() ? step.getData().toJavaScript() : {};
    const expectation = stepData.expectation;
    const field = stepData.field;
    const position = stepData.position || 1;
    const operator = stepData.operator;

    try {
      if (!this.operators.includes(operator)) {
        return this.fail('Invalid operator. "%s" is not supported.', [
          operator,
        ]);
      }

      const inbox: Inbox = await this.client.getInbox(stepData.email);

      if (!inbox || inbox === null) {
        return this.fail('Cannot fetch inbox for: "%s"', [
          stepData.email,
        ]);
      }

      if (!inbox.items[position - 1]) {
        return this.fail('Cannot fetch email in position: "%s"', [
          position,
        ]);
      }

      // tslint:disable-next-line:max-line-length
      const email: Email = await this.client.getEmailByStorageUrl(inbox.items[position - 1].storage.url);

      if (email === null || !email) {
        return this.fail('Cannot fetch email in position: "%s"', [
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
        return this.fail('Comparison failed using: "%s" operator. Actual: "%s" Expected: "%s"', [
          operator,
          email[field],
          expectation,
        ]);
      }
    } catch (e) {
      return this.error('There was an error reaching mailgun: %s', [e.toString()]);
    }
  }

  executeComparison(expected: string, actual: string, operator: string): boolean {
    let result: boolean = false;

    if (operator === 'Is Exactly') {
      result = expected === actual;
    } else if (operator === 'Contains') {
      result = actual.toLowerCase().includes(expected.toLowerCase());
    } else if (operator === 'Does not Contain') {
      result = !actual.toLowerCase().includes(expected.toLowerCase());
    }

    return result;
  }
}

export { EmailFieldValidation as Step };
