import * as chai from 'chai';
import { default as sinon } from 'ts-sinon';
import * as sinonChai from 'sinon-chai';
import 'mocha';

import { ClientWrapper } from '../../src/client/client-wrapper';
import { Metadata } from 'grpc';

chai.use(sinonChai);

describe('ClientWrapper', () => {
  // const expect = chai.expect;
  // let httpsConstructorStub: any;
  // let metadata: Metadata;
  // let clientWrapperUnderTest: ClientWrapper;

  // beforeEach(() => {
  //   httpsConstructorStub = sinon.stub();
  // });

  // it('getInbox', () => {
  //   metadata = new Metadata();
  //   metadata.add('endpoint', 'https://test.endpoint/v1');
  //   metadata.add('domain', 'thisisjust.atomatest.com');

  //   const expectedEmail = 'test@thisisjust.atomatest.com';
  //   clientWrapperUnderTest = new ClientWrapper(metadata, httpsConstructorStub);
  //   clientWrapperUnderTest.getInbox(expectedEmail);

  //   expect(httpsConstructorStub).to.have.been.calledWith(
  //     `https://test.endpoint/v1/thisisjust.atomatest.com/events?event=stored&to=${expectedEmail}`,
  //   );
  // });

});
