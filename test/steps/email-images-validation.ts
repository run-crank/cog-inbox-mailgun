import { Struct } from 'google-protobuf/google/protobuf/struct_pb';
import * as chai from 'chai';
import { default as sinon } from 'ts-sinon';
import * as sinonChai from 'sinon-chai';
import 'mocha';

import { Step as ProtoStep, StepDefinition, FieldDefinition, RunStepResponse } from '../../src/proto/cog_pb';
import { Step } from '../../src/steps/email-images-validation';

chai.use(sinonChai);

describe('EmailImagesValidationStep', () => {
  const expect = chai.expect;
  let protoStep: ProtoStep;
  let stepUnderTest: Step;
  let clientWrapperStub: any;

  beforeEach(() => {
    protoStep = new ProtoStep();
    clientWrapperStub = sinon.stub();
    clientWrapperStub.getInbox = sinon.stub();
    clientWrapperStub.getEmailByStorageUrl = sinon.stub();
    clientWrapperStub.evaluateUrls = sinon.stub();

    clientWrapperStub.auth = {
      get: sinon.stub(),
    };
    clientWrapperStub.getRawMimeMessage = sinon.stub();
    clientWrapperStub.getRawMimeMessage.returns(Promise.resolve('test'));

    clientWrapperStub.auth.get.withArgs('domain').returns('anyDomain.com');

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
    });

    it('should return expected step metadata', () => {
      const stepDef: StepDefinition = stepUnderTest.getDefinition();
      expect(stepDef.getStepId()).to.equal('EmailImagesValidationStep');
      expect(stepDef.getName()).to.equal('Check that no image link in an email is broken');
      expect(stepDef.getExpression()).to.equal('the (?<position>\\d+)(?:(st|nd|rd|th))? mailgun email for (?<email>.+) should not contain broken images');
      expect(stepDef.getType()).to.equal(StepDefinition.Type.VALIDATION);
    });
  });

  describe('Validate Images', () => {
    beforeEach(() => {
      clientWrapperStub.getInbox.resolves({
        items: [
          {
            message: {
              headers: {
                subject: 'anySubject',
                to: 'anyTo',
                from: 'anyFrom',
              }
            },
            storage: {
              url: 'anyUrl',
            },
          }
        ]
      });
  
      clientWrapperStub.getEmailByStorageUrl.resolves({
        ['body-html']: `
        <html>
          <head>
            Test Head
          </head>
          <body>
            Test Body
            <a href="https://info.stackmoxie.com/ODc5LUVQVy05NzQAAAGJqTd4IMrWTgwYlHE4cbB6T95B1rgNbMPRWclboBKu_-3KldaSxzdPzyMx9qTN8wRraXQPzMc="></a>
            <img src="https://info.stackmoxie.com/trk?t=1&mid=ODc5LUVQVy05NzQ6MDowOjA6MDoxODg3OjI6MDowOjhkYTgxY2EzLWIzZjMtNGY3ZC1iZTBhLTBiYWY3YzI1NDQxZkB0aGlzaXNqdXN0LmF0b21hdGVzdC5jb20%3D" width="1" height="1" style="display:none !important;" alt="" />
          </body>
        </html>
        `
      });
  
      clientWrapperStub.evaluateUrls.resolves({
        brokenUrls: [],
        workingUrls: [{
          url: 'https://any.url.com',
          order: 1,
        }],
      });
    });

    it('should return pass without broken image urls', async () => {
      protoStep.setData(Struct.fromJavaScript({
        email: 'any@anyDomain.com',
        position: 1
      }));
      const response = await stepUnderTest.executeStep(protoStep);
      console.log(response.getMessageFormat());
      expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.PASSED);
    });

    it('should return fail with broken image urls', async () => {
      clientWrapperStub.evaluateUrls.resolves({
        brokenUrls: [{
          url: 'https://any.url.com',
          order: 1,
        }],
        workingUrls: [{
          url: 'https://any.url.com',
          order: 1,
        }],
      });

      protoStep.setData(Struct.fromJavaScript({
        email: 'any@anyDomain.com',
        position: 1
      }));
      const response = await stepUnderTest.executeStep(protoStep);
      console.log(response.getMessageFormat());
      expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.FAILED);
    });

    it('should return error with domain not matching email input', async () => {
      protoStep.setData(Struct.fromJavaScript({
        email: 'any@notAnyDomain.com',
        position: 1
      }));
      const response = await stepUnderTest.executeStep(protoStep);
      console.log(response.getMessageFormat());
      expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.ERROR);
    });

    it('should return error if inbox returned is null', async () => {
      clientWrapperStub.getInbox.resolves(null);
      protoStep.setData(Struct.fromJavaScript({
        email: 'any@anyDomain.com',
        position: 1
      }));
      const response = await stepUnderTest.executeStep(protoStep);
      console.log(response.getMessageFormat());
      expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.ERROR);
    });

    it('should return error if inbox only has message', async () => {
      clientWrapperStub.getInbox.resolves({
        message: {},
      });
      protoStep.setData(Struct.fromJavaScript({
        email: 'any@anyDomain.com',
        position: 1
      }));
      const response = await stepUnderTest.executeStep(protoStep);
      console.log(response.getMessageFormat());
      expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.ERROR);
    });

    it('should return error if email on position 2 does not exist', async () => {
      protoStep.setData(Struct.fromJavaScript({
        email: 'any@anyDomain.com',
        position: 2
      }));
      const response = await stepUnderTest.executeStep(protoStep);
      console.log(response.getMessageFormat());
      expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.ERROR);
    });

    it('should return error if client call rejects', async () => {
      clientWrapperStub.getInbox.rejects(new Error())
  
      protoStep.setData(Struct.fromJavaScript({
        email: 'any@anyDomain.com',
        position: 1
      }));
      const response = await stepUnderTest.executeStep(protoStep);
      console.log(response.getMessageFormat());
      expect(response.getOutcome()).to.equal(RunStepResponse.Outcome.ERROR);
    });
  });
});
