import {Server} from '@loopback/core';
import {Context, inject} from "@loopback/context"
import {Channel, Replies, Options, ConfirmChannel} from "amqplib"
import {repository} from '@loopback/repository';
import {CategoryRepository} from '../repositories';
import {Category} from '../models';
import {RabbitmqBindings} from '../keys';
import {AmqpConnectionManagerOptions, AmqpConnectionManager, connect, ChannelWrapper} from 'amqp-connection-manager';

export interface RabbitmqConfig {
  uri: string
  connOptions?: AmqpConnectionManagerOptions
  exchanges?: {name: string, type: string, options?: Options.AssertExchange}[]
}

export class RabbitMqServer extends Context implements Server {

  private _listening: boolean;
  private _conn: AmqpConnectionManager
  private _channelManager: ChannelWrapper
  channel: Channel

  constructor(
    @repository(CategoryRepository) private categoryRepository: CategoryRepository,
    @inject(RabbitmqBindings.CONFIG) private config: RabbitmqConfig
  ) {
    super()
  }

  async start(): Promise<void> {
    this._conn = connect([this.config.uri], this.config.connOptions)
    this._channelManager = this._conn.createChannel()

    this.channelManager.on('connect', () => {
      console.log("Connected to Rabbitmq!")
      this._listening = true
    })

    this.channelManager.on('error', (err, {name}) => {
      console.log(`Failed to setup a Rabbitmq channel - name:${name} | error:${err.message}`)
      this._listening = false
    })

    await this.setupExchanges()
    //this.boot()
  }

  private async setupExchanges() {
    return this.channelManager.addSetup(async (channel: ConfirmChannel) => {
      if (!this.config.exchanges) {
        return
      }

      await Promise.all(this.config.exchanges.map((exchange) => (
        channel.assertExchange(exchange.name, exchange.type, exchange.options)
      )))
    })
  }

  async boot() {
    // @ts-ignore
    this.channel = await this.conn.createChannel()
    const queue: Replies.AssertQueue = await this.channel.assertQueue('micro-catalog/sync-videos')
    const exchange: Replies.AssertExchange = await this.channel.assertExchange('amq.topic', 'topic')

    await this.channel.bindQueue(queue.queue, exchange.exchange, 'model.*.*')
    //const result = this.channel.sendToQueue('my-first-queue', Buffer.from('hello world'))
    //this.channel.publish('amq.direct', 'minha-routing-key', Buffer.from('publicado por routing key'))

    this.channel.consume(queue.queue, (message) => {
      if (!message) {
        return
      }
      const data = JSON.parse(message.content.toString())
      const [model, event] = message.fields.routingKey.split('.').splice(1)
      this
        .sync({model, event, data})
        .then(() => this.channel.ack(message))
        .catch(() => this.channel.reject(message, false))
    })
    //console.log(result)
  }

  async sync({model, event, data}: {model: string, event: string, data: Category}) {
    if (model === 'category') {
      switch (event) {
        case 'created':
          await this.categoryRepository.create({
            ...data,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          break
        case 'updated':
          await this.categoryRepository.updateById(data.id, data)
          break
        case 'deleted':
          await this.categoryRepository.deleteById(data.id)
      }
    }
  }

  async stop(): Promise<void> {
    await this.conn.close()
    this._listening = false
  }

  get listening(): boolean {
    return this._listening
  }

  get conn(): AmqpConnectionManager {
    return this._conn
  }

  get channelManager(): ChannelWrapper {
    return this._channelManager
  }

}
