import * as grpc from 'grpc';
import * as https from 'https';
import * as RequestPromise from 'request-promise';
import { parse as parseCsvString } from 'csv-string';

import { Field } from '../core/base-step';
import { FieldDefinition } from '../proto/cog_pb';
import { Inbox, Email } from '../models';

const axios = require('axios');
const formData = require('form-data');
const mailgunConstructor = require('mailgun.js');
const mailgun = new mailgunConstructor(formData);
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
  private axiosClient: any;

  constructor(auth: grpc.Metadata,  public idMap: any, clientConstructor = https, request = RequestPromise, axiosConstructor = axios) {
    this.auth = auth;
    this.request = request;
    const creds: string = `api:${this.auth.get('apiKey').toString()}`;
    this.basicAuth = `Basic ${Buffer.from(creds).toString('base64')}`;
    this.client = clientConstructor;
    this.axiosClient = axiosConstructor.create({
      baseURL: process.env.BASE_URL,
      timeout: 10000,
      headers: {},
    });
  }

  public async getValidationEmail() {
    return new Promise(async (resolve, reject) => {
      try {
        this.axiosClient.get(`/run/${this.idMap.scenarioId}/manual-validation`).then((response) => {
          resolve(response.data);
        }).catch((error) => {
          reject(error);
        });
      } catch (e) {
        reject(e);
      }

    });
  }

  public async createValidationEmail(emailAddress: string, testPrompt: string) {
    return new Promise(async (resolve, reject) => {
      try {
        this.axiosClient.post(`/run/${this.idMap.scenarioId}/manual-validation`, {
          emailAddress,
          testPrompt,
        }).then((response) => {
          resolve(response.data);
        }).catch((error) => {
          reject(error);
        });
      } catch (e) {
        reject(e);
      }
    });

  }

  public async sendValidationEmail(to: string, subject: string) {
    return new Promise(async (resolve, reject) => {
      const baseUrl = process.env.BASE_URL === 'https://api.automatoninc.com/v1' ? 'https://app.stackmoxie.com' : process.env.BASE_URL.split('/api/v1')[0];
      try {
        const url = `${baseUrl}/home/${this.idMap.requestorId}/manualvalidation/${this.idMap.scenarioId}`;
        const body = `
          Here is the link to validate your scenario:
          <br>
          ${url}
        `;
        await this.sendEmail(to, subject, body);
        resolve(null);
      } catch (e) {
        reject(e.message);
      }
    });

  }

  public async sendEmail(to: string, subject: string, body: string) {
    return new Promise(async (resolve, reject) => {
      try {
        // const mg = mailgun({ apiKey: this.auth.get('apiKey').toString(), domain: this.auth.get('domain').toString() });
        const mg = mailgun.client({ username: 'api', key: this.auth.get('apiKey').toString() });
        const emailData = {
          to,
          subject,
          from: `StackMoxie <noreply@${this.auth.get('domain').toString()}>`,
          html: body,
        };
        mg.messages.create(this.auth.get('domain').toString(), emailData).then((response) => {
          console.log(response);
        });
        resolve(null);
      } catch (e) {
        reject(e.message);
      }
    });
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

  public async evaluateUrls(urls, passOnCodes = '') {
    const brokenUrls = [];
    const workingUrls = [];
    const redirectUrls = [];
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) AutomatonChrome/91.0.4472.124 Safari/537.36';
    const customAgent = new (https.Agent as any)({
      maxHeaderSize: 32 * 1024,
      keepAlive: true,
      insecureHTTPParser: true,
    });
    // Some websites will reject the custom user agent. Don't specify a custom UA on these sites:
    const useDefaultUserAgent = [
      'www.facebook.com',
    ];

    const checkUrls = async (urls) => {
      await Promise.all(
        urls.map((url) => {
          return new Promise((resolve) => {
            // Check if the URL matches any string in the useDefaultUserAgent array
            const shouldUseNoHeaders = useDefaultUserAgent.some((host) => {
              return url.url.includes(host);
            });

            const axiosOptions: any = {
              httpsAgent: customAgent,
              maxRedirects: 5, // Ensures axios handles up to 5 redirects
            };

            if (!shouldUseNoHeaders) {
              axiosOptions.headers = { 'User-Agent': userAgent };
            }

            axios
              .get(url.url, axiosOptions)
              .then((response) => {
                if (
                  response.data.includes('var redirecturl') &&
                  response.data.includes('window.self.location = redirecturl') &&
                  response.data.includes('function redirect() {')
                ) {
                  const re = /(?<=var redirecturl = ').*?(?=')/;
                  const redirectLink = re.exec(response.data)?.[0];
                  if (redirectLink && !redirectLink.includes('mailto:')) {
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
                  finalUrl: response.request.res.responseUrl || url.url,
                  order: url.order,
                });
                resolve(response);
              })
              .catch((error) => {
                const statusCode = error.response?.status;
                const responseBody = error.response?.data;

                if (passOnCodes && statusCode && passOnCodes.split(',').map((v) => { return v.trim(); }).includes(statusCode.toString())) {
                  workingUrls.push({
                    statusCode,
                    url: error.response?.request?.res.responseUrl || url.url,
                    message: `Status code: ${statusCode}`,
                    type: url.type,
                    finalUrl: error.response?.request?.res.responseUrl || url.url,
                    order: url.order,
                  });
                } else if (statusCode === 302) {
                  if (
                    responseBody?.includes('window.self.location = ') &&
                    responseBody.includes('var redirecturl = ') &&
                    responseBody.includes('function redirect() {')
                  ) {
                    const re = /(?<=var redirecturl = ').*?(?=')/;
                    const redirectLink = re.exec(responseBody)?.[0];
                    if (redirectLink && !redirectLink.includes('mailto:')) {
                      redirectUrls.push({
                        url: redirectLink,
                        type: 'HTML',
                      });
                    }
                  } else if (
                    responseBody?.includes('404 Not Found') &&
                    responseBody.includes('The redirect url is empty')
                  ) {
                    brokenUrls.push({
                      url: error.response?.request?.res.responseUrl || url.url,
                      message: 'The redirect url is empty',
                      type: url.type,
                      statusCode: '404',
                      finalUrl: error.response?.request?.res.responseUrl || url.url,
                      order: url.order,
                    });
                  } else {
                    brokenUrls.push({
                      url: error.response?.request?.res.responseUrl || url.url,
                      message: statusCode ? `Status code: ${statusCode}` : 'No response received',
                      type: url.type,
                      statusCode: statusCode || 'No response received',
                      finalUrl: error.response?.request?.res.responseUrl || url.url,
                      order: url.order,
                    });
                  }
                } else if (statusCode === 999) {
                  workingUrls.push({
                    url: error.response?.request?.res.responseUrl || url.url,
                    message: 'Status code: 999',
                    type: url.type,
                    statusCode: '999',
                    finalUrl: error.response?.request?.res.responseUrl || url.url,
                    order: url.order,
                  });
                } else {
                  brokenUrls.push({
                    url: error.response?.request?.res.responseUrl || url.url,
                    message: statusCode ? `Status code: ${statusCode}` : 'No response received',
                    type: url.type,
                    statusCode: statusCode || 'No response received',
                    finalUrl: error.response?.request?.res.responseUrl || url.url,
                    order: url.order,
                  });
                }
                resolve(null);
              });
          });
        }),
      );
    };

    await checkUrls(urls);
    await checkUrls(redirectUrls);

    return { brokenUrls, workingUrls };
  }
}
