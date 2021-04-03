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
			hash = tail
			tail = value.prev ? value.prev.toString() : null
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
		const hash      = localStorage.getItem("immutablog")
		const ipns      = localStorage.getItem("immutablog-ipns")
		const head      = null
		const following = {}
		const log       = []
		this.state = { name, hash, head, following, log, ipns }
	}
	async componentDidMount() {
		ipfs = await IPFS.create()
		if(this.state.hash) {
			await this.load(this.state.hash)
		}
	}
	async componentWillUnmount() {
		await ipfs.stop()
	}
	async getHeadOfFollowing(following) {
		console.table(following)
		const promList = Object.keys(following).map(async (name) => await last(ipfs.name.resolve(following[name])))
		console.log(promList)
		return await Promise.all(promList)
	}
	async getLog(head, following) {
		console.table({ head, following })
		let log = [];
		console.log(`head: ${ head }`)
		const lifo = new Lifo(head)
		//let foll
		//if(following)
		//	foll = await this.getHeadOfFollowing(following)
		//console.log(foll)
		//const all  = [ lifo, ...foll ]
		for await (const item of lifo) {
			console.table(item)
			log.push(item)
		}
		return log
	}
	async createVersion(name) {
		console.log(`name: ${ name }`)
		console.table(this.state)
		const { hash: orig, head, following = {} } = this.state
		const log  = await this.getLog(head, following)
		const hash = await this.save({ name, hash: orig, head, following, log })
		console.log(`hash: ${ hash }`)
	}
	async createLog(body) {
		console.table(this.state)
		const { hash, head: oldHead, name, log = [], following = {} } = this.state
		const cid = await ipfs.dag.put({
			prev : oldHead,
			name,
			body
		})
		const head = cid.toString()
		log.unshift({ name, body, head, hash: head })
		await this.save({ name, hash, head, following, log })
	}
	async load(hash) {
		console.log(`load(${ hash })`)
		console.table(this.state)
		const { name = "", head: maybeHead, following } = (await ipfs.dag.get(this.state.hash)).value
		const head = maybeHead !== null && maybeHead !== undefined ? maybeHead.toString() : null;
		const log = await this.getLog(head, following)
		this.setState({ name, head, following, log })
		console.table(this.state)
	}
	async save({ name, hash: orig, head, following, log }) {
		console.table({ name, hash: orig, head, following, log })
		const cid  = await ipfs.dag.put({
			"parent"  : orig,
			name,
			head,
			following,
		})
		const hash = cid.toString()
		localStorage.setItem("immutablog", hash)
		const ipns = await ipfs.name.publish(cid, { allowOffline: true })
		console.table(ipns)
		localStorage.setItem("immutablog-ipns", ipns.name)
		this.setState({ name, hash, head, following, log, ipns: ipns.name })
		console.table(this.state)
	}

	render() {
		const { hash, ipns, head, following = {}, log = [] } = this.state
		if(this.state.hash) {
			console.table(this.state)
			return (
				<div>
					<pre>{ hash }</pre>
					<pre>{ ipns }</pre>
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
										hash,
										head,
										log,
										following: { ...following, [name]: cid }
									})
								}
							}
						>
							<table>
								<tbody>
									{
										Object.keys(following).sort().map(
											name => <tr key={name}>
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
