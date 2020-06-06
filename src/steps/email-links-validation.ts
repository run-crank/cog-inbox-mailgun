import { BaseStep, Field, StepInterface, ExpectedRecord } from '../core/base-step';
import { FieldDefinition, Step, StepDefinition, StepRecord, RecordDefinition } from '../proto/cog_pb';
import { Inbox } from '../models';
import { DOMParser } from 'xmldom';

import * as GetUrls from 'get-urls';

/*tslint:disable:no-else-after-return*/
export class EmailLinksValidationStep extends BaseStep implements StepInterface {

  protected stepName: string = 'Check that no link in an email is broken';
  // tslint:disable-next-line:max-line-length
  protected stepExpression: string = 'the (?<position>\\d+)(?:(st|nd|rd|th))? mailgun email for (?<email>.+) should not contain broken links';
  protected stepType: StepDefinition.Type = StepDefinition.Type.VALIDATION;
  protected expectedFields: Field[] = [{
    field: 'email',
    type: FieldDefinition.Type.EMAIL,
    description: 'The inbox\'s email address',
  }, {
    field: 'position',
    type: FieldDefinition.Type.NUMERIC,
    description: 'The nth message to check from the email\'s inbox',
  }];
  protected expectedRecords: ExpectedRecord[] = [{
    id: 'eml',
    type: RecordDefinition.Type.BINARY,
  }, {
    id: 'messages',
    type: RecordDefinition.Type.TABLE,
    fields: [{
      field: '#',
      type: FieldDefinition.Type.NUMERIC,
      description: 'Email receipt order number',
    }, {
      field: 'Subject',
      type: FieldDefinition.Type.STRING,
      description: 'Email subject line',
    }, {
      field: 'From',
      type: FieldDefinition.Type.STRING,
      description: 'Email from line',
    }, {
      field: 'To',
      type: FieldDefinition.Type.STRING,
      description: 'Email to line',
    }],
    dynamicFields: false,
  }, {
    id: 'links',
    type: RecordDefinition.Type.TABLE,
    fields: [{
      field: 'Type',
      type: FieldDefinition.Type.STRING,
      description: 'Link Found In (e.g. HTML or Plain-Text)',
    }, {
      field: 'Url',
      type: FieldDefinition.Type.URL,
      description: 'Link URL',
    }, {
      field: 'StatusCode',
      type: FieldDefinition.Type.NUMERIC,
      description: 'HTTP Status code when the link was checked (e.g. 404 or 200)',
    }],
    dynamicFields: false,
  }];

  async executeStep(step: Step) {
    const stepData: any = step.getData() ? step.getData().toJavaScript() : {};

    try {
      const domain: string = stepData.email.split('@')[1];
      const authDomain: string = this.client.auth.get('domain').toString();
      const position: number = stepData.position;

      if (domain !== authDomain) {
        return this.error("Couldn't check %s's email: Only addresses with the %s domain can be checked.", [
          stepData.email,
          authDomain,
        ]);
      }

      const inbox: Inbox = await this.client.getInbox(stepData.email);

      if (!inbox || inbox === null) {
        return this.error("There was a problem checking %s's email: no inbox found.", [
          stepData.email,
        ]);
      }

      if (inbox['message']) {
        return this.error("There was a problem checking %s's email: %s", [
          stepData.email,
          inbox['message'],
        ]);
      }

      let messageRecords;

      if (!inbox.items[position - 1]) {
        return this.error("Email #%d hasn't been received yet: there are %d message(s) in the inbox.", [
          position,
          inbox.items.length,
        ]);
      }

      const storageUrl: string = inbox.items.reverse()[position - 1].storage.url;

      if (inbox.items.length > 0) {
        messageRecords = this.createMessageRecords(inbox.items);
      } else {
        const rawMessage = await this.client.getRawMimeMessage(storageUrl);
        // tslint:disable-next-line:max-line-length
        messageRecords = this.binary('eml', 'Email Message', 'text/eml', Buffer.from(rawMessage).toString('base64'));
      }

      const email: Record<string, any> = await this.client.getEmailByStorageUrl(storageUrl);

      if (email === null || !email) {
        return this.error("There was a problem reading email #%d: email found but couldn't be read from storage.", [
          position,
        ]);
      }

      const htmlBody: string = email['body-html'] || '';
      const plain: string = email['body-plain'] || '';

      const dom = new DOMParser({
        errorHandler: {
          warning: () => {},
          error: () => {},
          fatalError: () => {},
        },
      }).parseFromString(htmlBody);

      const anchors = dom.getElementsByTagName('a');
      const htmlUrls = [];
      let href: string;
      // tslint:disable-next-line:no-increment-decrement
      for (let i = 0; i < anchors.length; i++) {
        href = anchors.item(i).getAttribute('href');
        if (href && href.includes('http')) {
          htmlUrls.push({
            url: href,
            type: 'HTML',
          });
        }
        href = '';
      }

      const plainUrls = Array.from(GetUrls(plain).values()).map((f) => { return { url: f, type: 'Plain' }; });

      const urls = new Set(htmlUrls.concat(plainUrls));
      const sanitizedUrls = this.sanitizeUrl(Array.from(urls.values()));

      const response = await this.client.evaluateUrls(
        sanitizedUrls,
      );

      const brokenUrls = response.brokenUrls;
      const allUrls = response.brokenUrls.concat(response.workingUrls)
        .sort((a, b) => a.url.localeCompare(b.url));
      const linkRecords = this.createLinkRecords(allUrls);

      if (brokenUrls.length > 0) {
        return this.fail('Broken links were found in the email', [], [linkRecords, messageRecords]);
      }

      return this.pass(
        'No broken links were found in email #%d in %s\'s inbox',
        [position, stepData.email],
        [linkRecords, messageRecords],
      );
    } catch (e) {
      return this.error(
        'There was a problem checking links in email #%d in %s\'s inbox: %s',
        [stepData.position, stepData.email, e.toString()],
      );
    }
  }

  private sanitizeUrl(urls): string[] {
    if (!urls) {
      return;
    }

    return urls.filter(f => !f.url.includes('%3E'));
  }

  createMessageRecords(emails: Record<string, any>[]) {
    const records = [];
    emails.forEach((email, i) => {
      records.push({
        '#': i + 1,
        Subject: email.message.headers.subject,
        From: email.message.headers.from,
        To: email.message.headers.to,
      });
    });

    const headers = {
      '#': '#',
      Subject: 'Subject',
      From: 'From',
      To: 'To',
    };
    return this.table('messages', 'Received Email Messages', headers, records);
  }

  createLinkRecords(urls: Record<string, any>[]) {
    const records = urls.map((url) => {
      return {
        Type: url.type,
        Url: url.url,
        StatusCode: url.statusCode,
      };
    });

    const headers = { Type: 'Type', Url: 'URL', StatusCode: 'StatusCode' };
    return this.table('links', 'Found Links', headers, records);
  }
}

export { EmailLinksValidationStep as Step };
