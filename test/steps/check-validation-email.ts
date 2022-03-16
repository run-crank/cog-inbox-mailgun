import { Struct } from 'google-protobuf/google/protobuf/struct_pb';
import * as chai from 'chai';
import { default as sinon } from 'ts-sinon';
import * as sinonChai from 'sinon-chai';
import 'mocha';

import { Step as ProtoStep, StepDefinition, RunStepResponse } from '../../src/proto/cog_pb';
import { Step } from '../../src/steps/check-validation-email';

chai.use(sinonChai);

describe('CheckValidationEmailStep', () => {
  const expect = chai.expect;
  let protoStep: ProtoStep;
  let stepUnderTest: Step;
  let clientWrapperStub: any;

  beforeEach(() => {
    protoStep = new ProtoStep();
    clientWrapperStub = sinon.stub();
    clientWrapperStub.getValidationEmail = sinon.stub();

    stepUnderTest = new Step(clientWrapperStub);
  });

  describe('Fields', () => {
    it('should return no expected step fields', () => {
      const definition: StepDefinition = stepUnderTest.getDefinition();
      const fields: any[] = definition.getExpectedFieldsList().map(f => f.toObject());

      expect(fields.length).to.equal(0);
    });
  });

  describe('Metadata', () => {
    it('should return expected step metadata', () => {
      const def: StepDefinition = stepUnderTest.getDefinition();
      expect(def.getStepId()).to.equal('CheckValidationEmailStep');
      expect(def.getName()).to.equal('Check a validation email');
      expect(def.getExpression()).to.equal('Check validation email');
      expect(def.getType()).to.equal(StepDefinition.Type.VALIDATION);
    });
  });

  it('testApproved true should return pass', async () => {
    clientWrapperStub.getValidationEmail.resolves({
      emailAddress: 'any@any.com',
      testApproved: true,
    });
    protoStep.setData(Struct.fromJavaScript({}));
    const response = await stepUnderTest.executeStep(protoStep);
    expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.PASSED);
  });

  it('testApproved fail should return fail', async () => {
    clientWrapperStub.getValidationEmail.resolves({
      emailAddress: 'any@any.com',
      testApproved: false,
    });
    protoStep.setData(Struct.fromJavaScript({}));
    const response = await stepUnderTest.executeStep(protoStep);
    expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.FAILED);
  });

  it('testApproved null should return error', async () => {
    clientWrapperStub.getValidationEmail.resolves({
      emailAddress: 'any@any.com',
      testApproved: null,
    });
    protoStep.setData(Struct.fromJavaScript({}));
    const response = await stepUnderTest.executeStep(protoStep);
    expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.ERROR);
  });
});
