import { BaseStep, Field, StepInterface, ExpectedRecord } from '../core/base-step';
import { FieldDefinition, Step, StepDefinition, StepRecord, RecordDefinition } from '../proto/cog_pb';
import { Inbox } from '../models';
import { DOMParser } from 'xmldom';
import * as urlRegex from 'url-regex';
import * as normalizeUrl from 'normalize-url';

/*tslint:disable:no-else-after-return*/
export class EmailImagesValidationStep extends BaseStep implements StepInterface {

  protected stepName: string = 'Check that no image link in an email is broken';
  // tslint:disable-next-line:max-line-length
  protected stepExpression: string = 'the (?<position>\\d+)(?:(st|nd|rd|th))? mailgun email for (?<email>.+) should not contain broken images';
  protected stepType: StepDefinition.Type = StepDefinition.Type.VALIDATION;
  protected actionList: string[] = ['check'];
  protected targetObject: string = 'Email Images';
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
    id: 'images',
    type: RecordDefinition.Type.TABLE,
    fields: [{
      field: 'Type',
      type: FieldDefinition.Type.STRING,
      description: 'Image Found In (e.g. HTML or Plain-Text)',
    }, {
      field: 'StatusCode',
      type: FieldDefinition.Type.NUMERIC,
      description: 'HTTP Status code when the image was checked (e.g. 404 or 200)',
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

      // Prepare HTML and Plain Text URLs
      const htmlBody: string = email['body-html'] || '';
      console.log(htmlBody);
      // const plainTextBody: string = email['body-plain'] || '';
      const htmlImages = this.extractImagesFromHtmlBody(htmlBody);

      // Use `Set` to ensure uniqueness and each unique URL gets evaluated only once
      const images = new Set(htmlImages);
      const sanitizedUrls = this.sanitizeUrls(Array.from(images.values()));

      // Evaluate every URLs to check which are broken
      const response = await this.client.evaluateUrls(sanitizedUrls);

      // Ignore URLs with /track?mktoTestLink in Email Link Validation. It is used to determine which email opens are from BOTs.
      // Let's suppress it from being displayed in the results of a scenario log.
      response.brokenUrls = response.brokenUrls.filter(url => !url.url.includes('/track?mktoTestLink') && !url.url.includes('tel:')); // Exclude telephone numbers;
      response.workingUrls = response.workingUrls.filter(url => !url.url.includes('/track?mktoTestLink') && !url.url.includes('tel:'));

      // Join all URLs and order them as found initially from the email.
      const allImages = response.brokenUrls.concat(response.workingUrls)
        .sort((a, b) => a.order - b.order);
      const imageRecords = this.createLinkRecords(allImages);

      const htmlRecord = this.keyValue('emailHtml', 'Email Html', { html: htmlBody });
      if (response.brokenUrls.length > 0) {
        return this.fail('Broken images were found in the email', [], [htmlRecord, imageRecords, messageRecords]);
      }

      return this.pass(
        'No broken images were found in email #%d in %s\'s inbox',
        [position, stepData.email],
        [htmlRecord, imageRecords, messageRecords],
      );
    } catch (e) {
      console.log(e);
      return this.error(
        'There was a problem checking images in email #%d in %s\'s inbox: %s',
        [stepData.position, stepData.email, e.toString()],
      );
    }
  }

  private sanitizeUrls(images): any[] {
    if (!images) {
      return;
    }

    return images.map((url) => {
      url.url = url.url.replace('%3E', '');
      return url;
    });
  }

  private extractImagesFromHtmlBody(htmlBody: string): any[] {
    const dom = new DOMParser({
      errorHandler: {
        warning: () => { },
        error: () => { },
        fatalError: () => { },
      },
    }).parseFromString(htmlBody);

    const anchors = dom.getElementsByTagName('img');
    const htmlImages = [];
    let src: string;
    // tslint:disable-next-line:no-increment-decrement
    for (let i = 0; i < anchors.length; i++) {
      src = anchors.item(i).getAttribute('src');
      if (src && src.includes('http')) {
        htmlImages.push({
          url: src,
          type: 'HTML',
        });
      }
      src = '';
    }

    // Ensure ordering as found from the inbox
    htmlImages.forEach((value, i) => value.order = i + 1);

    return htmlImages;
  }

  createMessageRecords(emails: Record<string, any>[]) {
    const records = [];
    emails.forEach((email, i) => {
      console.log(email);
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

  createLinkRecords(images: Record<string, any>[]) {
    const asRecord = (url) => {
      return {
        Type: url.type,
        Url: url.url,
        StatusCode: url.statusCode,
        FinalUrl: url.finalUrl,
      };
    };
    const html = images.filter(url => url.type === 'HTML').map(asRecord);
    const plain = images.filter(url => url.type === 'Plain').map(asRecord);
    const records = html.concat(plain);

    const headers = {
      Type: 'Type',
      Url: 'URL',
      StatusCode:
        'StatusCode',
      FinalUrl: 'FinalUrl',
    };
    return this.table('images', 'Found Links', headers, records);
  }

  createEmailHtmlRecord(images: Record<string, any>[]) {
    const asRecord = (url) => {
      return {
        Type: url.type,
        Url: url.url,
        StatusCode: url.statusCode,
        FinalUrl: url.finalUrl,
      };
    };
    const html = images.filter(url => url.type === 'HTML').map(asRecord);
    const plain = images.filter(url => url.type === 'Plain').map(asRecord);
    const records = html.concat(plain);

    const headers = {
      Type: 'Type',
      Url: 'URL',
      StatusCode:
        'StatusCode',
      FinalUrl: 'FinalUrl',
    };
    return this.table('images', 'Found Links', headers, records);
  }
}

export { EmailImagesValidationStep as Step };
