import IPFS from 'ipfs-core';
import { Component } from "react";
import last from 'it-last';

let ipfs

class Lifo {
	constructor(tail) {
		this.tail = tail
	}
	async *[Symbol.asyncIterator]() {
		let tail = this.tail
		let hash
		while(tail) {
			console.log(tail)
			const value = (await ipfs.dag.get(tail)).value
			hash        = tail
			tail        = value.prev ? value.prev.toString() : null
			yield { ...value, hash }
		}
	}
}

function Log({hash, name, body}) {
	return <div style={ {display : "block" } }>
		<table>
			<tbody>
				<tr><td colSpan="2"><pre>{ hash }</pre></td></tr>
				<tr><td>Name</td><td>{ name }</td></tr>
				<tr><td>Body</td><td>{ body }</td></tr>
			</tbody>
		</table>
	</div>
}

class App extends Component {
	constructor() {
		super()
		const name      = null
		const ipns      = localStorage.getItem("immutablog-ipns")
		const head      = null
		const following = {}
		const log       = []
		this.state = { name, hash: null, head, following, log, ipns, age: 0 }
	}
	async componentDidMount() {
		ipfs = await IPFS.create({
			EXPERIMENTAL: {
				pubsub       : true,
				namesysPubsub: true,
			}
		})
		window.ipfs = ipfs
		if(this.state.ipns) {
			await this.load(this.state.ipns)
		}
	}
	async componentWillUnmount() {
		await ipfs.stop()
	}
	// ipfs.name.resolve is not working on browser
	async getHeadOfFollowing(following) {
		console.table(following)
		const promList = Object.keys(following).map(async (name) => {
			console.log(`name: ${ following[name] }`)
			console.log(await ipfs.name.resolve(following[name]))
			return new Lifo(await last(ipfs.name.resolve(following[name])))
		})
		console.log(promList)
		return await Promise.all(promList)
	}
	async getLog(head, following) {
		let { age } = this.state
		console.table({ head, following })
		let log = [];
		console.log(`head: ${ head }`)
		const lifo = new Lifo(head)
		// ipfs.name.resolve is not working on browser
		//let foll
		//if(following)
		//	foll = await this.getHeadOfFollowing(following)
		//const all  = [ lifo, ...foll ]
		//console.log(all)
		for await (const item of lifo) {
			console.table(item)
			log.push(item)
			if(item.age > age)
				this.setState({ age: item.age })
		}
		return log
	}
	async createVersion(name) {
		console.log(`name: ${ name }`)
		console.table(this.state)
		const { head, following = {} } = this.state
		const log  = await this.getLog(head, following)
		const hash = await this.save({ name, log })
		console.log(`hash: ${ hash }`)
	}
	async createLog(body) {
		console.table(this.state)
		const { ipns, hash, head: oldHead, name, log = [] } = this.state
		let { age } = this.state
		const cid = await ipfs.dag.put({
			from    : ipns,
			fromHash: hash,
			prev    : oldHead,
			age     : age++,
			name,
			body,
		})
		const head = cid.toString()
		const msg = { name, body, head, hash: head }
		log.unshift(msg)
		ipfs.pubsub.publish(ipns, JSON.stringify(msg))
		await this.save({ name, head, log, age })
	}
	async load(ipns) {
		console.log(`load(${ ipns })`)
		console.table(this.state)
		const hash = await last(ipfs.name.resolve(ipns))
		console.log(`hash: ${ hash }`)
		let { name = "", head: maybeHead, following, age } = (await ipfs.dag.get(hash)).value
		const head = maybeHead !== null && maybeHead !== undefined ? maybeHead.toString() : null;
		const log = await this.getLog(head, following)
		if(following) {
			await Promise.all(
				Object.values(following).map(
					async (user) => {
						console.log(`subscribing: ${ user }`)
						ipfs.pubsub.subscribe(user,
							({ from, data }) => {
								console.log(`received data: `, { from, data: data.toString() })
								if(user !== from) return;
								const msg = JSON.parse(data.toString())
								if(age < msg.age) age = msg.age
								log.unshift(msg)
							}
						)
					}
				)
			)
		}
		this.setState({ hash, name, head, following, log, age: age })
		console.table(this.state)
	}
	async save({
		name       = this.state.name,
		hash: orig = this.state.hash,
		head       = this.state.head,
		following  = this.state.following,
		log        = this.state.log,
		age        = this.state.age + 1
	}) {
		console.table({ name, hash: orig, head, following, log, age })
		const cid  = await ipfs.dag.put({
			"parent"  : orig,
			name,
			head,
			following,
			age
		})
		const hash = cid.toString()
		const ipns = await ipfs.name.publish(cid)
		localStorage.setItem("immutablog-ipns", ipns.name)
		this.setState({ name, hash, head, following, log, ipns: ipns.name, age })
		console.table(this.state)
		return hash
	}

	render() {
		const { hash, ipns, following = {}, log = [] } = this.state
		if(ipns) {
			console.table(this.state)
			return (
				<div>
					<pre>/ipns/{ ipns }</pre>
					<pre>{ hash }</pre>
					<div>
						<h4>Following</h4>
						<form
							onSubmit={
								e => {
									e.preventDefault()
									const name = e.target.name.value
									const cid  = e.target.cid.value
									e.target.name.value = ""
									e.target.cid.value  = ""
									this.save({
										name,
										following: { ...following, [name]: cid },
									})
								}
							}
						>
							<table>
								<tbody>
									{
										Object.keys(following).sort().map(
											name => <tr key={ name }>
												<td>{ name }</td>
												<td><pre>{ following[name] }</pre></td>
											</tr>
										)
									}
									<tr>
										<td>
											name<br />
											<input name="name" />
										</td>
										<td>
											ipns<br />
											<input name="cid" />
											<input type="submit" value="+" />
										</td>
									</tr>
								</tbody>
							</table>
						</form>
					</div>
					<h4>What's happening?</h4>
					<form onSubmit={
						e => {
							e.preventDefault();
							this.createLog(e.target.body.value)
							e.target.body.value = ""
						}
					}>
						<textarea name="body" />
						<input type="submit" />
					</form>
					<h4>Log</h4>
					{
						log.map(
							i => <Log key={ i.hash } { ...i } />
						)
					}
				</div>
			)
		} else {
			return <form
				onSubmit={
					e => {
						e.preventDefault();
						this.createVersion(e.target.name.value)
					}
				}
			>
				Your name: <input name="name" />
				<input type="submit" />
			</form>
		}
	}
}

export default App;
