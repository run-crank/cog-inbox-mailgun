import { ClientWrapper } from '../client/client-wrapper';
import { promisify } from 'util';
import { Email, Inbox } from '../models';
​​
class CachingClientWrapper {
  // cachePrefix is scoped to the specific scenario, request, and requestor
  public cachePrefix = `${this.idMap.scenarioId}${this.idMap.requestorId}`;

  constructor(private client: ClientWrapper, public redisClient: any, public idMap: any) {
    this.redisClient = redisClient;
    this.idMap = idMap;
  }

  public async getValidationEmail() {
    return await this.client.getValidationEmail();
  }

  public async createValidationEmail(emailAddress: string, testPrompt: string) {
    return await this.client.createValidationEmail(emailAddress, testPrompt);
  }

  public async sendValidationEmail(to: string, subject: string) {
    await this.client.sendValidationEmail(to, subject);
  }

  public async sendEmail(to: string, subject: string, body: string) {
    await this.client.sendEmail(to, subject, body);
  }

  public async getInbox(email: string): Promise<Inbox> {
    return await this.client.getInbox(email);
  }

  public async getEmailByStorageUrl(storageUrl: string): Promise<Email> {
    return await this.client.getEmailByStorageUrl(storageUrl);
  }

  public async getRawMimeMessage(storageUrl: string) {
    return await this.client.getRawMimeMessage(storageUrl);
  }

  public async evaluateUrls(urls) {
    return await this.client.evaluateUrls(urls);
  }

  // Redis methods for get, set, and delete
  // -------------------------------------------------------------------

  // Async getter/setter
  public getAsync = promisify(this.redisClient.get).bind(this.redisClient);
  public setAsync = promisify(this.redisClient.setex).bind(this.redisClient);
  public delAsync = promisify(this.redisClient.del).bind(this.redisClient);

  public async getCache(key: string) {
    try {
      const stored = await this.getAsync(key);
      if (stored) {
        return JSON.parse(stored);
      }
      return null;
    } catch (err) {
      console.log(err);
    }
  }

  public async setCache(key: string, value: any) {
    try {
      // arrOfKeys will store an array of all cache keys used in this scenario run, so it can be cleared easily
      const arrOfKeys = await this.getCache(`cachekeys|${this.cachePrefix}`) || [];
      arrOfKeys.push(key);
      await this.setAsync(key, 55, JSON.stringify(value));
      await this.setAsync(`cachekeys|${this.cachePrefix}`, 55, JSON.stringify(arrOfKeys));
    } catch (err) {
      console.log(err);
    }
  }

  public async delCache(key: string) {
    try {
      await this.delAsync(key);
    } catch (err) {
      console.log(err);
    }
  }

  public async clearCache() {
    try {
      // clears all the cachekeys used in this scenario run
      const keysToDelete = await this.getCache(`cachekeys|${this.cachePrefix}`) || [];
      if (keysToDelete.length) {
        keysToDelete.forEach(async (key: string) => await this.delAsync(key));
      }
      await this.setAsync(`cachekeys|${this.cachePrefix}`, 55, '[]');
    } catch (err) {
      console.log(err);
    }
  }

}
​
export { CachingClientWrapper as CachingClientWrapper };
