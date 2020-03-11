import { Struct } from 'google-protobuf/google/protobuf/struct_pb';
import * as chai from 'chai';
import { default as sinon } from 'ts-sinon';
import * as sinonChai from 'sinon-chai';
import 'mocha';

import { Step as ProtoStep, StepDefinition, FieldDefinition, RunStepResponse } from '../../src/proto/cog_pb';
import { Step } from '../../src/steps/email-field-validation';
import { Inbox, Email } from '../../src/models';

chai.use(sinonChai);

describe('EmailFieldValidationStep', () => {
  const expect = chai.expect;
  let protoStep: ProtoStep;
  let stepUnderTest: Step;
  let clientWrapperStub: any;

  beforeEach(() => {
    protoStep = new ProtoStep();
    clientWrapperStub = sinon.stub();
    clientWrapperStub.getInbox = sinon.stub();
    clientWrapperStub.getEmailByStorageUrl = sinon.stub();
    clientWrapperStub.auth = {
      get: sinon.stub(),
    };
    clientWrapperStub.getRawMimeMessage = sinon.stub();
    clientWrapperStub.getRawMimeMessage.returns(Promise.resolve('test'));

    clientWrapperStub.auth.get.withArgs('domain').returns('thisisjust.atomatest.com');

    stepUnderTest = new Step(clientWrapperStub);
  });

  describe('Metadata', () => {
    it('should return expected step fields', () => {
      const stepDef: StepDefinition = stepUnderTest.getDefinition();
      const fields: any[] = stepDef.getExpectedFieldsList().map((field: FieldDefinition) => {
        return field.toObject();
      });

      // Email field
      expect(fields[0].key).to.equal('email');
      expect(fields[0].optionality).to.equal(FieldDefinition.Optionality.REQUIRED);
      expect(fields[0].type).to.equal(FieldDefinition.Type.EMAIL);

      // Position field
      expect(fields[1].key).to.equal('position');
      expect(fields[1].optionality).to.equal(FieldDefinition.Optionality.REQUIRED);
      expect(fields[1].type).to.equal(FieldDefinition.Type.NUMERIC);

      // Field Name field
      expect(fields[2].key).to.equal('field');
      expect(fields[2].optionality).to.equal(FieldDefinition.Optionality.REQUIRED);
      expect(fields[2].type).to.equal(FieldDefinition.Type.STRING);

      // Operator field
      expect(fields[3].key).to.equal('operator');
      expect(fields[3].optionality).to.equal(FieldDefinition.Optionality.REQUIRED);
      expect(fields[3].type).to.equal(FieldDefinition.Type.STRING);

      // Expectation field
      expect(fields[4].key).to.equal('expectation');
      expect(fields[4].optionality).to.equal(FieldDefinition.Optionality.REQUIRED);
      expect(fields[4].type).to.equal(FieldDefinition.Type.ANYSCALAR);
    });

    it('should return expected step metadata', () => {
      const stepDef: StepDefinition = stepUnderTest.getDefinition();
      expect(stepDef.getStepId()).to.equal('EmailFieldValidationStep');
      expect(stepDef.getName()).to.equal('Check the content of an email');
      expect(stepDef.getExpression()).to.equal('the (?<field>(subject|body-html|body-plain|from)) of the (?<position>\\d+)(?:(st|nd|rd|th))? mailgun email for (?<email>[^\\s]+) (?<operator>(should contain|should not contain|should be)) (?<expectation>.+)');
      expect(stepDef.getType()).to.equal(StepDefinition.Type.VALIDATION);
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

  describe('Get inbox exception', () => {
    beforeEach(() => {
      clientWrapperStub.getInbox.throws('any error');
    });

    it('should respond with an error if the client getInbox call throws an error', async () => {
      const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
      expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.ERROR);
    });
  });

  describe('Inbox not found', () => {
    beforeEach(() => {
      clientWrapperStub.getInbox.returns(Promise.resolve(null));
    });

    it('should respond with error when inbox was not found', async () => {
      const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
      expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.ERROR);
    });
  });

  describe('Email not found given a position', () => {
    beforeEach(() => {
      const inbox: Inbox = { items: [{}] };
      protoStep.setData(Struct.fromJavaScript({
        email: 'someone@thisisjust.atomatest.com',
        field: 'subject',
        position: 1028,
      }));
      clientWrapperStub.getInbox.returns(Promise.resolve(inbox));
    });

    it('should respond with error when input position is out of bounds', async () => {
      const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
      expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.ERROR);
    });
  });

  describe('Unexpected error fetching email using the storage url', () => {
    beforeEach(() => {
      // tslint:disable-next-line:max-line-length
      const inbox: any = { items: [{ storage: { url: 'https://some-email.url/' }, message: { headers: { subject: '', from: '', to: '' } } }, { storage: { url: 'https://some-email.url/' }, message: { headers: { subject: '', from: '', to: '' } } }] };
      protoStep.setData(Struct.fromJavaScript({
        email: 'someone@thisisjust.atomatest.com',
        field: 'subject',
        position: 1,
      }));
      clientWrapperStub.getInbox.returns(Promise.resolve(inbox));
      clientWrapperStub.getEmailByStorageUrl.returns(Promise.resolve(null));
    });

    it('should respond with error when input position is out of bounds', async () => {
      const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
      expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.ERROR);
    });
  });

  describe('Pass scenarios', () => {
    beforeEach(() => {
      // tslint:disable-next-line:max-line-length
      const inbox: any = { items: [{ storage: { url: 'https://some-email.url/' }, message: { headers: { subject: '', from: '', to: '' } } }, { storage: { url: 'https://some-email.url/' }, message: { headers: { subject: '', from: '', to: '' } } }] };
      const email: Email = { subject: 'Welcome, Customer!' };
      clientWrapperStub.getInbox.returns(Promise.resolve(inbox));
      clientWrapperStub.getEmailByStorageUrl.returns(Promise.resolve(email));
    });

    it('should pass using should be operator', async () => {
      protoStep.setData(Struct.fromJavaScript({
        email: 'someone@thisisjust.atomatest.com',
        field: 'subject',
        position: 1,
        expectation: 'Welcome, Customer!',
        operator: 'should be',
      }));
      const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
      expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.PASSED);
    });

    it('should pass using should contain operator', async () => {
      protoStep.setData(Struct.fromJavaScript({
        email: 'someone@thisisjust.atomatest.com',
        field: 'subject',
        position: 1,
        expectation: 'Welcome',
        operator: 'should contain',
      }));
      const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
      expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.PASSED);
    });

    it('should pass using should not contain operator', async () => {
      protoStep.setData(Struct.fromJavaScript({
        email: 'someone@thisisjust.atomatest.com',
        field: 'subject',
        position: 1,
        expectation: 'Non existent string',
        operator: 'should not contain',
      }));
      const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
      expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.PASSED);
    });
  });

  describe('Fail scenarios', () => {
    beforeEach(() => {
      // tslint:disable-next-line:max-line-length
      const inbox: any = { items: [{ storage: { url: 'https://some-email.url/' }, message: { headers: { subject: '', from: '', to: '' } } }, { storage: { url: 'https://some-email.url/' }, message: { headers: { subject: '', from: '', to: '' } } }] };
      const email: Email = { subject: 'Welcome, Customer!' };
      clientWrapperStub.getInbox.returns(Promise.resolve(inbox));
      clientWrapperStub.getEmailByStorageUrl.returns(Promise.resolve(email));
    });

    it('should fail using should be operator', async () => {
      protoStep.setData(Struct.fromJavaScript({
        email: 'someone@thisisjust.atomatest.com',
        field: 'subject',
        position: 1,
        expectation: 'Welcome, Customers!',
        operator: 'should be',
      }));
      const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
      expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.FAILED);
    });

    it('should fail using should contain operator', async () => {
      protoStep.setData(Struct.fromJavaScript({
        email: 'someone@thisisjust.atomatest.com',
        field: 'subject',
        position: 1,
        expectation: 'Welcom3',
        operator: 'should contain',
      }));
      const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
      expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.FAILED);
    });

    it('should fail using should not contain operator', async () => {
      protoStep.setData(Struct.fromJavaScript({
        email: 'someone@thisisjust.atomatest.com',
        field: 'subject',
        position: 1,
        expectation: 'Customer',
        operator: 'should not contain',
      }));
      const response: RunStepResponse = await stepUnderTest.executeStep(protoStep);
      expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.FAILED);
    });
  });
});
