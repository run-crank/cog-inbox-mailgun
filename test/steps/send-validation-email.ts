import { Struct } from 'google-protobuf/google/protobuf/struct_pb';
import * as chai from 'chai';
import { default as sinon } from 'ts-sinon';
import * as sinonChai from 'sinon-chai';
import 'mocha';

import { Step as ProtoStep, StepDefinition, RunStepResponse, FieldDefinition } from '../../src/proto/cog_pb';
import { Step } from '../../src/steps/send-validation-email';

chai.use(sinonChai);

describe('SendValidationEmailStep', () => {
  const expect = chai.expect;
  let protoStep: ProtoStep;
  let stepUnderTest: Step;
  let clientWrapperStub: any;

  beforeEach(() => {
    protoStep = new ProtoStep();
    clientWrapperStub = sinon.stub();
    clientWrapperStub.createValidationEmail = sinon.stub();
    clientWrapperStub.sendValidationEmail = sinon.stub();

    stepUnderTest = new Step(clientWrapperStub);
  });

  describe('Fields', () => {
    it('should return no expected step fields', () => {
      const definition: StepDefinition = stepUnderTest.getDefinition();
      const fields: any[] = definition.getExpectedFieldsList().map(f => f.toObject());

      expect(fields[0].key).to.equal('email');
      expect(fields[0].optionality).to.equal(FieldDefinition.Optionality.REQUIRED);
      expect(fields[0].type).to.equal(FieldDefinition.Type.EMAIL);

      expect(fields[1].key).to.equal('validation');
      expect(fields[1].optionality).to.equal(FieldDefinition.Optionality.REQUIRED);
      expect(fields[1].type).to.equal(FieldDefinition.Type.STRING);
    });
  });

  describe('Metadata', () => {
    it('should return expected step metadata', () => {
      const def: StepDefinition = stepUnderTest.getDefinition();
      expect(def.getStepId()).to.equal('SendValidationEmailStep');
      expect(def.getName()).to.equal('Send a validation email');
      expect(def.getExpression()).to.equal('Send a validation email to (?<email>[^\\s]+)');
      expect(def.getType()).to.equal(StepDefinition.Type.ACTION);
    });
  });

  it('testApproved true should return pass', async () => {
    clientWrapperStub.createValidationEmail.resolves({});
    clientWrapperStub.sendValidationEmail.resolves({});
    protoStep.setData(Struct.fromJavaScript({
      email: 'any@email.com',
      validation: 'anyString'
    }));
    const response = await stepUnderTest.executeStep(protoStep);
    expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.PASSED);
  });

  it('testApproved null should return error', async () => {
    clientWrapperStub.createValidationEmail.throws(new Error());
    protoStep.setData(Struct.fromJavaScript({
      email: 'any@email.com',
      validation: 'anyString'
    }));
    const response = await stepUnderTest.executeStep(protoStep);
    expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.ERROR);
  });
});
