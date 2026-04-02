import { Injectable } from '@nestjs/common';
import axios from 'axios';

export type CampaignBatchContact = {
  campaignContactId: number;
  phone: string;
  name: string;
};

@Injectable()
export class BotService {
  private readonly botUrl = process.env.BOT_URL;
  private readonly botApiKey = process.env.BOT_API_KEY;

  private get headers() {
    return { 'x-api-key': this.botApiKey };
  }

  async getAgentStatus(): Promise<{ enabled: boolean }> {
    const { data } = await axios.get(`${this.botUrl}/agent/status`, {
      headers: this.headers,
      timeout: 5000,
    });
    return data;
  }

  async toggleAgent(): Promise<{ enabled: boolean; message: string }> {
    const { data } = await axios.post(
      `${this.botUrl}/agent/toggle`,
      {},
      { headers: this.headers, timeout: 5000 },
    );
    return data;
  }

  async enableAgent(): Promise<{ enabled: boolean }> {
    const { data } = await axios.post(
      `${this.botUrl}/agent/enable`,
      {},
      { headers: this.headers, timeout: 5000 },
    );
    return data;
  }

  async disableAgent(): Promise<{ enabled: boolean }> {
    const { data } = await axios.post(
      `${this.botUrl}/agent/disable`,
      {},
      { headers: this.headers, timeout: 5000 },
    );
    return data;
  }

  async sendCampaignBatch(payload: {
    campaignId: number;
    contacts: CampaignBatchContact[];
    message: string;
    imageUrl?: string;
  }): Promise<{ queued: number }> {
    const { data } = await axios.post(
      `${this.botUrl}/campaigns/send`,
      payload,
      { headers: this.headers, timeout: 10000 },
    );
    return data;
  }
}
