import * as grpc from 'grpc';
import * as https from 'https';
import * as RequestPromise from 'request-promise';

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

  private errors: Object = {
    'Invalid private keys': 'Auth error: Invalid private key',
    'Unknown domain': 'Auth error: Unknown domain',
  };
  private auth: grpc.Metadata;
  private basicAuth: string;
  private client: any;
  private request: RequestPromise.RequestPromiseAPI;

  constructor(auth: grpc.Metadata, clientConstructor = https, request = RequestPromise) {
    this.auth = auth;
    this.request = request;
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

          if (Object.keys(this.errors).includes(inbox['message'])) {
            inbox['message'] = this.errors[inbox['message']];
          }

          resolve(inbox);
        });
      });
    });

    return result;
  }

  public async getEmailByStorageUrl(storageUrl: string): Promise<Email> {
    const result: Promise<Email> = new Promise((resolve, reject) => {
      https.get(storageUrl, { headers: { Authorization: this.basicAuth } }, (res) => {
        let data: string = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          const email: Object = JSON.parse(data);

          if (email['message'] === 'Message not found') {
            resolve(null);
          }

          if (Object.keys(this.errors).includes(email['message'])) {
            email['message'] = this.errors[email['message']];
          }

          resolve(<Email>email);
        });
      });
    });

    return result;
  }

  public async getRawMimeMessage(storageUrl: string) {
    return new Promise((resolve, reject) => {
      this.request.get(storageUrl, {
        headers: {
          Accept: 'message/rfc2822',
          Authorization: this.basicAuth,
        },
      }).then((value) => {
        resolve(JSON.parse(value)['body-mime']);
      }).catch(reject);
    });
  }

  public async evaluateUrls(urls) {
    const brokenUrls = [];
    const workingUrls = [];
    const redirectUrls = [];

    const checkUrls = async (urls) => {
      await Promise.all(urls.map((url) => {
        return new Promise((resolve) => {
          this.request.get(url.url)
            .then((response) => {
              // The following code will check for redirect urls from marketo forms
              if (response.includes('var redirecturl') && response.includes('window.self.location = redirecturl') && response.includes('function redirect() {')) {
                const re = /(?<=var redirecturl = ').*?(?=')/;
                const redirectLink = re.exec(response)[0];
                // Don't include mailto: links
                if (!redirectLink.includes('mailto:')) {
                  redirectUrls.push({
                    url: redirectLink,
                    type: 'HTML',
                  });
                }
              }
              workingUrls.push({
                url: url.url,
                message: 'Status code: 200',
                type: url.type,
                statusCode: '200',
                finalUrl: response.request ? response.request.uri.href : url.url,
                order: url.order,
              });
              resolve(response);
            }).catch((err) => {
              if (err.statusCode && err.statusCode === 999) {
                // If this is an error code 999 (LinkedIn), then add this to the working urls
                workingUrls.push({
                  url: err.response && err.response.request
                    ? err.response.request.uri.href : url.url,
                  message: 'Status code: 999',
                  type: url.type,
                  statusCode: '999',
                  finalUrl: err.response && err.response.request
                    ? err.response.request.uri.href : url.url,
                  order: url.order,
                });
              } else {
                brokenUrls.push({
                  url: err.response && err.response.request
                    ? err.response.request.uri.href : url.url,
                  message: err.statusCode ? `Status code: ${err.statusCode}` : 'No response received',
                  type: url.type,
                  statusCode: err.statusCode ? err.statusCode : 'No response received',
                  finalUrl: err.response && err.response.request
                    ? err.response.request.uri.href : url.url,
                  order: url.order,
                });
              }
              resolve();
            });
        });
      }));
    };

    await checkUrls(urls);
    await checkUrls(redirectUrls);

    const response = { brokenUrls, workingUrls };
    return Promise.resolve(response);
  }
}
