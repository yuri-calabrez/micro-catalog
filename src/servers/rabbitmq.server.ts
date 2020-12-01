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
  queues?: {name: string, options?: Options.AssertQueue, exchange?: {name: string, routingKey: string}}[]
  defaultHandlerError?: ResponseEnum
}

export class RabbitMqServer extends Context implements Server {

  private _listening: boolean;
  private _conn: AmqpConnectionManager
  private _channelManager: ChannelWrapper
  private maxAttemps = 3
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
    await this.setupQueues()
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

  private async setupQueues() {
    return this.channelManager.addSetup(async (channel: ConfirmChannel) => {
      if (!this.config.queues) {
        return
      }

      await Promise.all(this.config.queues.map(async (queue) => {
        await channel.assertQueue(queue.name, queue.options)
        if (!queue.exchange) {
          return
        }
        await channel.bindQueue(queue.name, queue.exchange.name, queue.exchange.routingKey)
      }),
      )
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
        console.error(e, {
          routingKey: message?.fields.routingKey,
          content: message?.content.toString()
        })
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
        this.handleNack({channel, message})
        break
      case ResponseEnum.ACK:
      default:
        channel.ack(message)
    }
  }

  private handleNack({channel, message}: {channel: Channel, message: Message}) {
    const canDeadLetter = this.canDeadLetter({channel, message})

    if (canDeadLetter) {
      console.log("Nack in message:", {content: message.content.toString()})
      channel.nack(message, false, false)
    } else {
      channel.ack(message)
    }
  }

  private canDeadLetter({channel, message}: {channel: Channel, message: Message}): boolean {
    if (message.properties.headers && 'x-death' in message.properties.headers) {
      const count = message.properties.headers['x-death']![0].count

      if (count >= this.maxAttemps) {
        channel.ack(message)
        const queue = message.properties.headers['x-death']![0].queue
        console.error(`Ack in ${queue} with error. Max attempts exceeded: ${this.maxAttemps}`)
        return false;
      }
    }

    return true
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
