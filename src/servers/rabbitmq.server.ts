import {Server} from '@loopback/core';
import {Context} from "@loopback/context"
import {connect, Connection, Channel, Replies} from "amqplib"

export class RabbitMqServer extends Context implements Server {

  private _listening: boolean;
  conn: Connection

  async start(): Promise<void> {
    this.conn = await connect({
      hostname: 'rabbitmq',
      username: 'admin',
      password: 'admin'
    })
    this._listening = true
    this.boot()
  }

  async boot() {
    const channel: Channel = await this.conn.createChannel()
    const queue: Replies.AssertQueue = await channel.assertQueue('micro-catalog/sync-videos')
    const exchange: Replies.AssertExchange = await channel.assertExchange('amq.topic', 'topic')

    await channel.bindQueue(queue.queue, exchange.exchange, 'model.*.*')
    //const result = channel.sendToQueue('my-first-queue', Buffer.from('hello world'))
    //await channel.publish('amq.direct', 'minha-routing-key', Buffer.from('publicado por routing key'))

    channel.consume(queue.queue, (message) => {
      if (!message) {
        return
      }
      console.log(JSON.parse(message.content.toString()))
      const [model, event] = message.fields.routingKey.split('.').splice(1)
      console.log(model, event)
    })
    //console.log(result)
  }

  async stop(): Promise<void> {
    await this.conn.close()
    this._listening = false
  }

  get listening(): boolean {
    return this._listening
  }

}
