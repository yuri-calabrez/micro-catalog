import {Server} from '@loopback/core';
import {Context} from "@loopback/context"
import {connect, Connection, Channel, Replies} from "amqplib"
import {repository} from '@loopback/repository';
import {CategoryRepository} from '../repositories';
import {Category} from '../models';

export class RabbitMqServer extends Context implements Server {

  private _listening: boolean;
  conn: Connection
  channel: Channel

  constructor(@repository(CategoryRepository) private categoryRepository: CategoryRepository) {
    super()
  }

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

}
