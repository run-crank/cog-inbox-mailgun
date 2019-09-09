import * as grpc from 'grpc';
import * as https from 'https';
import { Field } from '../core/base-step';
import { FieldDefinition } from '../proto/cog_pb';
import { Inbox, Email } from '../models';

export class ClientWrapper {
  public static expectedAuthFields: Field[] = [{
    field: 'apiKey',
    type: FieldDefinition.Type.STRING,
    description: 'Mailgun API Key',
  }, {
    field: 'domain',
    type: FieldDefinition.Type.STRING,
    description: 'Email Domain',
  }, {
    field: 'endpoint',
    type: FieldDefinition.Type.STRING,
    description: 'Mailgun API Endpoint',
  }];

  private auth: grpc.Metadata;
  private basicAuth: string;
  private client: any;

  constructor(auth: grpc.Metadata, clientConstructor = https) {
    this.auth = auth;
    const creds: string = `api:${this.auth.get('apiKey').toString()}`;
    this.basicAuth = `Basic ${Buffer.from(creds).toString('base64')}`;
    this.client = clientConstructor;
  }

  public async getInbox(email: string): Promise<Inbox> {
    const result: Promise<Inbox> = new Promise((resolve, reject) => {
      const requestUri: string = `${this.auth.get('endpoint').toString()}/${this.auth.get('domain').toString()}/events?event=stored&to=${email}`;

      this.client.get(requestUri, { headers: { Authorization: this.basicAuth } }, (res) => {
        let data: string = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          const inbox: Inbox = JSON.parse(data);
          resolve(inbox);
        });
      });
    });

    return result;
  }

  public async getEmailByStorageUrl(storageUrl: string): Promise<Email> {
    const result: Promise<Email> = new Promise((resolve, reject) => {
      https.get(storageUrl, { headers: { Authorization: this.basicAuth } }, (res) => {
        let data: any = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          const jsonData: Object = JSON.parse(data);

          if (jsonData['message'] === 'Message not found') {
            resolve(null);
          }

          resolve(<Email>jsonData);
        });
      });
    });

    return result;
  }
}
