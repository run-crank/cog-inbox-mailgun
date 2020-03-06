import { Struct } from 'google-protobuf/google/protobuf/struct_pb';
import * as chai from 'chai';
import { default as sinon } from 'ts-sinon';
import * as sinonChai from 'sinon-chai';
import 'mocha';

import { Step as ProtoStep, StepDefinition, FieldDefinition, RunStepResponse } from '../../src/proto/cog_pb';
import { Step } from '../../src/steps/email-count-equals';
import { Inbox } from '../../src/models';

chai.use(sinonChai);

describe('EmailCountEqualsStep', () => {
  const expect = chai.expect;
  let protoStep: ProtoStep;
  let stepUnderTest: Step;
  let clientWrapperStub: any;

  beforeEach(() => {
    protoStep = new ProtoStep();
    clientWrapperStub = sinon.stub();
    clientWrapperStub.getInbox = sinon.stub();
    clientWrapperStub.auth = {
      get: sinon.stub(),
    };

    clientWrapperStub.auth.get.withArgs('domain').returns('thisisjust.atomatest.com');

    stepUnderTest = new Step(clientWrapperStub);
  });

  describe('Fields', () => {
    it('should return expected step fields', () => {
      const definition: StepDefinition = stepUnderTest.getDefinition();
      const fields: any[] = definition.getExpectedFieldsList().map(f => f.toObject());

      expect(fields[0].key).to.equal('email');
      expect(fields[0].optionality).to.equal(FieldDefinition.Optionality.REQUIRED);
      expect(fields[0].type).to.equal(FieldDefinition.Type.EMAIL);

      expect(fields[1].key).to.equal('count');
      expect(fields[1].optionality).to.equal(FieldDefinition.Optionality.REQUIRED);
      expect(fields[1].type).to.equal(FieldDefinition.Type.NUMERIC);
    });
  });

  describe('Metadata', () => {
    it('should return expected step metadata', () => {
      const def: StepDefinition = stepUnderTest.getDefinition();
      expect(def.getStepId()).to.equal('EmailCountEqualsStep');
      expect(def.getName()).to.equal('Check the number of emails received');
      expect(def.getExpression()).to.equal('there should be (?<count>\\d+) emails in mailgun for (?<email>.+)');
      expect(def.getType()).to.equal(StepDefinition.Type.VALIDATION);
    });
  });

  describe('Mismatch domain', () => {
    beforeEach(() => {
      clientWrapperStub.auth.get.withArgs('domain').returns('mismatch.com');
      protoStep.setData(Struct.fromJavaScript({
        email: 'someone@thisisjust.atomatest.com',
        field: 'subject',
        position: 1028,
      }));
    });

    it('should return fail', async () => {
      const response = await stepUnderTest.executeStep(protoStep);
      expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.ERROR);
    });
  });

  describe('Inbox not found', () => {
    beforeEach(() => {
      clientWrapperStub.getInbox.returns(Promise.resolve(null));
    });

    it('should respond with error', async () => {
      const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
      expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.ERROR);
    });
  });

  describe('Expected count equals inbox items count', () => {
    beforeEach(() => {
      // tslint:disable-next-line:max-line-length
      const inbox = { items: [{ message: { headers: { subject: '', from: '', to: '' } } }, { message: { headers: { subject: '', from: '', to: '' } } }] };
      clientWrapperStub.getInbox.returns(Promise.resolve(inbox));
    });

    it('should respond with pass', async () => {
      protoStep.setData(Struct.fromJavaScript({
        email: 'someone@thisisjust.atomatest.com',
        count: 2,
      }));

      const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);

      expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.PASSED);
    });
  });

  describe('Expected count not equal to inbox items count', () => {
    beforeEach(() => {
      // tslint:disable-next-line:max-line-length
      const inbox = { items: [{ message: { headers: { subject: '', from: '', to: '' } } }, { message: { headers: { subject: '', from: '', to: '' } } }] };
      clientWrapperStub.getInbox.returns(Promise.resolve(inbox));
    });

    it('should respond with fail', async () => {
      protoStep.setData(Struct.fromJavaScript({
        email: 'someone@thisisjust.atomatest.com',
        count: 10,
      }));

      const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);

      expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.FAILED);
    });
  });
});
