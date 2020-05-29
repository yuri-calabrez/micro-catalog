import {Server, CoreBindings, Application} from '@loopback/core';
import {Context, inject, MetadataInspector, Binding} from "@loopback/context"
import {Channel, Options, ConfirmChannel, Message} from "amqplib"
import {RabbitmqBindings} from '../keys';
import {AmqpConnectionManagerOptions, AmqpConnectionManager, connect, ChannelWrapper} from 'amqp-connection-manager';
import {RABBITMQ_SUBSCRIBE_DECORATOR, RabbitmqSubscribeMetadata} from '../decorators';

export enum ResponseEnum {
  ACK = 0,
  REQUEUE = 1,
  NECK = 2
}
export interface RabbitmqConfig {
  uri: string
  connOptions?: AmqpConnectionManagerOptions
  exchanges?: {name: string, type: string, options?: Options.AssertExchange}[]
  defaultHandlerError?: ResponseEnum
}

export class RabbitMqServer extends Context implements Server {

  private _listening: boolean;
  private _conn: AmqpConnectionManager
  private _channelManager: ChannelWrapper
  channel: Channel

  constructor(
    @inject(CoreBindings.APPLICATION_INSTANCE) public app: Application,
    @inject(RabbitmqBindings.CONFIG) private config: RabbitmqConfig
  ) {
    super(app)
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
    await this.bindingSubscribers()
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

  private async bindingSubscribers() {
    this
      .getSubscribers()
      .map(async (item) => {
        await this.channelManager.addSetup(async (channel: ConfirmChannel) => {
          const {exchange, queue, routingKey, queueOptions} = item.metadata

          const assertQueue = await channel.assertQueue(queue ?? '', queueOptions ?? undefined)

          const routingKeys = Array.isArray(routingKey) ? routingKey : [routingKey]

          await Promise.all(routingKeys.map(rk => channel.bindQueue(assertQueue.queue, exchange, rk)))

          await this.consume({channel, queue: assertQueue.queue, method: item.method})
        })
      })
  }

  private getSubscribers(): {method: Function, metadata: RabbitmqSubscribeMetadata}[] {
    const bindigs: Array<Readonly<Binding>> = this.find('services.*')

    return bindigs
      .map(binding => {
        const metadata = MetadataInspector.getAllMethodMetadata<RabbitmqSubscribeMetadata>(
          RABBITMQ_SUBSCRIBE_DECORATOR, binding.valueConstructor?.prototype
        )
        if (!metadata) {
          return []
        }

        const methods = []
        for (const methodName in metadata) {
          if (!Object.prototype.hasOwnProperty.call(metadata, methodName)) {
            return
          }
          const service = this.getSync(binding.key) as any

          methods.push({
            method: service[methodName].bind(service),
            metadata: metadata[methodName]
          })
        }
        return methods
      })
      .reduce((collection: any, item: any) => {
        collection.push(...item)
        return collection
      }, [])
  }

  private async consume({channel, queue, method}: {channel: ConfirmChannel, queue: string, method: Function}) {
    await channel.consume(queue, async message => {
      try {
        if (!message) {
          throw new Error("Received no message")
        }

        const content = message.content
        if (content) {
          let data
          try {
            data = JSON.parse(content.toString())
          } catch (e) {
            data = null
          }

          const responseType = await method({data, message, channel})

          this.dispatchResponse(channel, message, responseType)

        }
      } catch (e) {
        if (!message) {
          return
        }

        this.dispatchResponse(channel, message, this.config?.defaultHandlerError)
      }
    })
  }

  private dispatchResponse(channel: Channel, message: Message, responseType?: ResponseEnum) {
    switch (responseType) {
      case ResponseEnum.REQUEUE:
        channel.nack(message, false, true)
        break
      case ResponseEnum.NECK:
        channel.nack(message, false, false)
        break
      case ResponseEnum.ACK:
      default:
        channel.ack(message)
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
