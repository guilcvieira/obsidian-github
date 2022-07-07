/* eslint-disable no-useless-escape */
import { App, Notice, Plugin, PluginSettingTab, Setting } from 'obsidian'
import { Issue, Label, obsidianGitHubPluginSettings } from './interfaces'
import { getIssues } from 'src/connections/github.connections'


const DEFAULT_ISSUE_SETTINGS: obsidianGitHubPluginSettings = {
	auth: '',
	owner: '',
	repo: '',
	onlyLinked: 'false',
	lastMerge: '1900-01-01T00:00:00Z',
	childrenIssuesNumber: [],
}

export default class GithubIssuesPlugin extends Plugin {
	issueSettings: obsidianGitHubPluginSettings

	async onload() {
		await this.loadSettings()

		await this.createFolder('issues')

		const ribbonIconEl = this.addRibbonIcon('github', 'Git Issue Merge', (evt: MouseEvent) => {
			this.mergeIssues()
		})
		ribbonIconEl.addClass('git-ribbon-class')

		this.addSettingTab(new SettingTab(this.app, this))

		this.registerInterval(window.setInterval(() => this.intervalFunctions(), 5 * 60 * 1000))
	}

	onunload() {

	}

	async intervalFunctions() {
		await this.createFolder('issues')
		await this.mergeIssues()
	}

	async createFolder(folderName: string) {
		try {
			await this.app.vault.createFolder(folderName)
		} catch (e) {
			null
		}
	}

	async loadSettings() {
		this.issueSettings = Object.assign({}, DEFAULT_ISSUE_SETTINGS, await this.loadData())
	}

	async saveSettings() {
		await this.saveData(this.issueSettings)
	}

	async getAllFiles() {
		const files = await this.app.vault.getFiles()
		return files
	}
	
	async mergeIssues(issues: Array<Issue> = [], page = 1, perPageIssues = 100) {
		await this.createFolder('issues')
		await this.getAllFiles().then(async files => { files.length === 0 ? this.issueSettings.lastMerge = '1900-01-01T00:00:00Z' : null })

		await getIssues(this.issueSettings, page, perPageIssues)
			.then((pageIssues: Array<Issue>) => {
				pageIssues.map(issue => {
					issues.push(issue)
				})

				if (pageIssues.length === 0) {
					new Notice('No more issues to merge')
					return
				}

				if (pageIssues.length === perPageIssues) {
					return this.mergeIssues(issues, page + 1, perPageIssues)
				} else {
					this.getValidIssues(issues)
						.then(validIssues => {
							validIssues.map(issue => {
								this.createIssueNote(issue)
							})
						})
						.finally(() => {
							const lastMerge = new Date().toISOString()
							this.issueSettings.lastMerge = lastMerge
							this.saveSettings()
						})
				}
			})
	}

	/**
	 *  Creates a note for the issue.
	 * @param issue The issue to create a note for.
	 */
	async createIssueNote(issue: Issue) {

		const path = `issues/${issue.number}.md`
		const existingIssues = await this.getAllFiles()

		this.makeConnections(issue)
			.then(connectedIssues => {
				this.prepareIssue(issue, connectedIssues)
					.then(async body => {

						const oldIssue = existingIssues.find(existingIssue => existingIssue.path === path)

						if (oldIssue) {
							try {
								await this.app.vault.delete(oldIssue)
							} catch (e) {
								console.log(e)
								new Notice(e.message)
							}
						}

						try {
							await this.app.vault.create(path, body)
						} catch (e) {
							console.log(e)
							new Notice(e.message)
						}
					})

			})
	}

	/**
	 * prepare body's note
	 * @param issue 
	 * @returns 
	 */
	async prepareIssue(issue: Issue, body: string): Promise<string> {

		let newBody = ''

		newBody = `---\n`

		// print tags
		newBody += `tags: [${this.fixLabels(issue.labels)}] \n`

		// print assignees
		newBody += `assignees: ${issue.assignees.map(user => user.login).join(' ')} \n`

		// print status
		newBody += `state: ${issue.state} \n`

		// print dates
		newBody += `created_at: ${issue.created_at} \n`
		newBody += `updated_at: ${issue.updated_at} \n`

		newBody += `---\n \n`

		// print issue's url
		newBody += `^${issue.html_url}\n`

		// print issue's title
		newBody += `# ${issue.title} \n`

		// print issue's body
		newBody += `${body}`

		return Promise.resolve(newBody)
	}

	/**
	 * Remove spaces from label names
	 * @param labels 
	 * @returns 
	 */
	fixLabels(labels: Array<Label>) {
		return labels.map((label: Label) => label.name.replace(' ', '_')).join(', ')
	}

	/**
	 * Look for Updated, Parent, Child and Orphan Issues
	 * @param issues 
	 * @returns Array of valid issues
	 */
	async getValidIssues(issues: Array<Issue>): Promise<Array<Issue>> {

		const validIssues: Array<Issue> = []

		await this.getUpdadtedIssues(issues)
			.then(async updatedIssues => {
				await updatedIssues.map(issue => { validIssues.push(issue) })
				await this.getParentIssues(issues)
					.then(async parentIssues => {
						await parentIssues.map(issue => validIssues.push(issue))
						await this.getChildrenIssues(issues)
							.then(async childrenIssues => {
								await childrenIssues.map(issue => validIssues.push(issue))
								if (this.issueSettings.onlyLinked === "true") {
									this.getOrphanIssues(issues, validIssues)
										.then(async orphanIssues => {
											await orphanIssues.map(issue => validIssues.push(issue))
										})
								}
							})
					})
			})

		const uniqueIssues = validIssues.filter((issue, index) => {
			return validIssues.indexOf(issue) === index
		})

		return uniqueIssues
	}

	async getUpdadtedIssues(issues: Array<Issue>): Promise<Array<Issue>> {
		const updatedIssues: Array<Issue> = []
		const existentIssues = await this.getAllFiles()

		issues.map(issue => {
			const existingIssue = existentIssues.find(existingIssue => existingIssue.path === `issues/${issue.number}.md`)
			if (existingIssue) {
				updatedIssues.push(issue)
			}
		})

		return updatedIssues
	}

	async getParentIssues(issues: Array<Issue>): Promise<Array<Issue>> {

		const hashRegex = /(\- \[.\] #)(\d+((.|,)\d+)?)/gm
		const httpRegexFind = /(\- \[.\] https:\/\/github.com.*issues.)/gm

		const parentIssues: Array<Issue> = []

		issues.map(issue => {
			if (issue.body)
				if (issue.body.match(hashRegex) || issue.body.match(httpRegexFind)) parentIssues.push(issue)
		})

		return parentIssues
	}

	async getChildrenIssues(issues: Array<Issue>): Promise<Array<Issue>> {

		const childrenIssues: Array<Issue> = []
		const childrenIssuesNumber = this.issueSettings.childrenIssuesNumber

		const hashRegex = /(\- \[.\] #)(\d+((.|,)\d+)?)/gm
		const httpRegexFind = /(\- \[.\] https:\/\/github.com.*issues.)/gm
		const httpRegexReplace = /(\- \[.\] https:\/\/github.com.*issues.)?(\- \[.\] )(https:\/\/github.com.*issues.)(\d+((.|,)\d+)?)/gm

		await issues.map(issue => {
			if (issue.body) {
				if (!this.issueSettings.childrenIssuesNumber.some(childrenIssue => childrenIssue === issue.number)) {
					if (issue.body.match(hashRegex))
						issue.body.match(hashRegex).map(hashIssue => {
							childrenIssuesNumber.push(Number(hashIssue.replace(hashRegex, '$2')))
							this.issueSettings.childrenIssuesNumber.push(Number(hashIssue.replace(hashRegex, '$2')))
						})

					if (issue.body.match(httpRegexFind))
						issue.body.match(httpRegexReplace).map(httpIssue => {
							childrenIssuesNumber.push(Number(httpIssue.replace(httpRegexReplace, '$4')))
							this.issueSettings.childrenIssuesNumber.push(Number(httpIssue.replace(httpRegexReplace, '$4')))
						})
				}
			}
		})

		await childrenIssuesNumber.map(number => {
			if (issues.find(issue => issue.number == number))
				childrenIssues.push(issues.find(issue => issue.number == number))
		})

		this.issueSettings.childrenIssuesNumber = [... new Set(this.issueSettings.childrenIssuesNumber)]

		await this.saveSettings()

		return childrenIssues
	}

	async getOrphanIssues(issues: Array<Issue>, parentedIssues: Array<Issue>): Promise<Array<Issue>> {
		const orphanIssues: Array<Issue> = []

		issues.map(issue => {
			if (!parentedIssues.find(parentedIssue => parentedIssue.number == issue.number))
				orphanIssues.push(issue)
		})

		return orphanIssues

	}
	async makeConnections(issue: Issue): Promise<string> {
		if (!issue.body) return ''

		let newBody = ''

		await this.getHashIssues(issue.body)
			.then(async connectedHashes => {
				await this.getHttpIssues(connectedHashes)
					.then(connectedHttps => {
						newBody = connectedHttps
					})
			})

		return newBody
	}

	/**
	 * Get issue's body and identify `#issues` in tasks to make obsidian connects 
	 * @issueBody  string body from github api
	 */
	async getHashIssues(issueBody: string): Promise<string> {
		if (!issueBody) return ''

		return await issueBody.replace(/(\- \[.\] #)(\d+((.|,)\d+)?)/gm, '$1[[$2]]')
	}

	/**
	 * Get issue's body and identify `http:// issues` in tasks to make obsidian connects 
	 * @issueBody  string body from github api
	 */
	async getHttpIssues(issueBody: string): Promise<string> {
		if (!issueBody) return ''

		return await issueBody.replace(/(\- \[.\] https:\/\/github.com.*issues.)?(\- \[.\] )(https:\/\/github.com.*issues.)(\d+((.|,)\d+)?)/gm, '$2#[[$4]]')
	}

}

class SettingTab extends PluginSettingTab {
	plugin: GithubIssuesPlugin

	constructor(app: App, plugin: GithubIssuesPlugin) {
		super(app, plugin)
		this.plugin = plugin
	}

	display(): void {
		const { containerEl } = this

		containerEl.empty()

		containerEl.createEl('h2', { text: 'Github Merge Issue Settings.' })
		containerEl.createEl('h2', {
			text: `Last merge at: ${new Date(this.plugin.issueSettings.lastMerge).toLocaleDateString(navigator.language, {
				hour: '2-digit',
				minute: '2-digit'
			})}`
		})

		new Setting(containerEl)
			.setName('Token')
			.setDesc('The token to use for the GitHub API.')
			.addText(text => text
				.setPlaceholder('Enter your secret')
				.setValue(this.plugin.issueSettings.auth)
				.onChange(async (value) => {
					this.plugin.issueSettings.auth = value
					await this.plugin.saveSettings()
				})
				.inputEl.type = 'password'
			)

		new Setting(containerEl)
			.setName('Organization')
			.setDesc('The organization to use for the GitHub API.')
			.addText(text => text
				.setPlaceholder('Enter your organization')
				.setValue(this.plugin.issueSettings.owner)
				.onChange(async (value) => {
					this.plugin.issueSettings.owner = value
					await this.plugin.saveSettings()
				})
			)

		new Setting(containerEl)
			.setName('Repository')
			.setDesc('The repository to use for the GitHub API.')
			.addText(text =>
				text
					.setPlaceholder('Enter your repository')
					.setValue(this.plugin.issueSettings.repo)
					.onChange(async value => {
						this.plugin.issueSettings.repo = value
						await this.plugin.saveSettings()
					})
			)

		new Setting(containerEl)
			.setName('linked')
			.setDesc('Get non linked issues')
			.addDropdown(dropdown => {
				dropdown
					.addOption('true', 'true')
					.addOption('false', 'false')
					.setValue(this.plugin.issueSettings.onlyLinked)
					.onChange(async value => {
						this.plugin.issueSettings.onlyLinked = value
						await this.plugin.saveSettings()
					})
			})

		new Setting(containerEl)
			.addButton(button => button
				.onClick(async () => {
					this.plugin.mergeIssues()
				})
				.setButtonText('Merge')
			)

	}
}
