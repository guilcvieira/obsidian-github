import { App, ButtonComponent, DropdownComponent, Modal, Setting, TextAreaComponent, TextComponent, ToggleComponent } from 'obsidian'
// @ts-ignore - not sure how to build a proper typescript def yet
import * as Mustache from 'mustache'
// @ts-ignore - not sure how to build a proper typescript def yet
import metadataParser from 'markdown-yaml-metadata-parser'
import { tmpdir } from 'os'
import { notDeepStrictEqual, strictEqual } from 'assert'
import GithubIssuesPlugin, { ReplacementOptions } from './main'
import { CreateType, ReplacementSpec, TemplateField } from './templates'
import { DateTime } from "luxon"

export class FillTemplate extends Modal {
    plugin: GithubIssuesPlugin
    result: ReplacementSpec
    options: ReplacementOptions
    constructor(app: App, plugin: GithubIssuesPlugin, spec: ReplacementSpec, options: ReplacementOptions) {
        super(app)
        this.result = spec
        this.plugin = plugin
        this.options = options
    }

    async onOpen() {
        const { contentEl } = this
        this.modalEl.addClass("from-template-modal")

        //console.log("Data before filling out template",this.result.data)
        //Create the top of the interface - header and input for Title of the new note

        this.titleEl.createEl('h4', { text: "Create from Template" })

        //Create each of the fields
        //console.log("Fields",this.result.settings.fields)
        this.result.settings.fields.forEach((f, i) => {
            this.createInput(contentEl, this.result.data, f, i)
        })

        const makeSubcontrol = (el: HTMLElement, title: string, content: string = "", cls: string[] = []) => {
            const sc = contentEl.createDiv({ cls: ["from-template-subsection", "setting-item-description"] })
            sc.createSpan({ text: `${title}:`, cls: "from-template-sublabel" })
            return sc.createSpan({ text: `${content}`, cls: ["from-template-subcontrol", ...cls] })
        }
        contentEl.createEl("hr", { cls: "from-template-section-sep" })

        // An info box...
        makeSubcontrol(contentEl, "Template", `${this.result.templateID.name}`)
        makeSubcontrol(contentEl, "Destination",
            `${this.result.settings.outputDirectory}/${this.result.settings.templateFilename}.md`,
            ["from-template-code-span"]
        )

        // And the extra controls at the bottom

        /* Should text be replaced? It's a combination of:
         * - if it is turned on in the plugin. Will be yes/no/if selection
         * - if that is overriden in the template - same values
         * - is there text selected
         * For now, just using the settings value that is passed in
        */
        const willReplace = () => {
            if (this.options.shouldReplaceSelection === "always") return true
            if (this.options.shouldReplaceSelection === "sometimes" && this.result.input.length > 0) return true
            return false
        }
        this.options.willReplaceSelection = willReplace()

        const fieldNames = this.result.settings.fields.map(f => f.id)
        fieldNames.push("templateResult")

        let replacementText: TextComponent
        const setReplaceText = (r: string) => {
            replacementText.setValue(r)
            this.result.replacementTemplate = r
        }
        const replaceSetting = new Setting(contentEl)
            .setName("Replace selected text")
            //.setDesc(("String to replace selection with. Template fields: "+))
            //.setDesc(("String to replace selection with."))
            .addToggle(toggle => toggle
                .setValue(willReplace())
                .onChange(async (value) => {
                    this.options.willReplaceSelection = value
                    replacementText.setDisabled(!value)
                }))

        //const repDiv = contentEl.createEl("div", {text: "Replacement: ", cls:"setting-item-description"})
        const repDiv = makeSubcontrol(contentEl, "Replacement")
        replacementText = new TextComponent(repDiv)
            .setValue(this.result.replacementTemplate)
            .onChange((value) => {
                this.result.replacementTemplate = value
            })
            .setDisabled(!willReplace())
        //replacementText.inputEl.size = 60



        const availFields = makeSubcontrol(contentEl, "Available")
        //const availFields = contentEl.createEl("div", {text: "Available fields: " , cls:"setting-item-description"})
        fieldNames.forEach(f => {
            const s = availFields.createEl("button", { text: f, cls: ["from-template-inline-code-button"] })
            s.onClickEvent((e) => setReplaceText(replacementText.getValue() + `{{${f}}}`))
        })


        // Create buttons for the alternative replacements
        const alternatives = makeSubcontrol(contentEl, "Replacements")
        //const alternatives = contentEl.createEl("div", { text: `Replacements:`, cls:["setting-item-description","from-template-command-list"]})
        this.result.settings.textReplacementTemplates.forEach((r, i) => {
            const el = new ButtonComponent(alternatives)
                .setButtonText(`${i + 1}: ${r}`).onClick((e) => setReplaceText(r)).buttonEl
            el.addClass("from-template-inline-code-button")
            el.tabIndex = -1
            this.scope.register(['Ctrl'], `${i + 1}`, () => setReplaceText(r))
        })

        new Setting(contentEl)
            .setName("Create and open note")
            .setDesc(("Should the note be created / opened?"))
            .addDropdown((dropdown) => {
                dropdown
                    .addOption("none", "Don't create")
                    .addOption("create", "Create, but don't open")
                    .addOption("open", "Create and open")
                    .addOption("open-pane", "Create and open in new pane")
                    .setValue(this.options.shouldCreateOpen)
                    .onChange((value) => {
                        this.options.shouldCreateOpen = value as CreateType
                    })
            })

        //On submit, get the data out of the form, pass through to main plugin for processing
        const submitTemplate = () => {
            this.plugin.templateFilled(this.result, this.options)
            this.close()
        }

        //And a submit button
        contentEl.createDiv({ cls: "from-template-section" })
            .createEl('button', { text: "Add", cls: "from-template-submit" })
            .addEventListener("click", submitTemplate)
        this.scope.register(['Mod'], "enter", submitTemplate)

    }





    /*
     * Creates the UI element for putting in the text. Takes a parent HTMLElement, and:
     * - creates a div with a title for the control
     * - creates a control, base on a field type. The 'field' parameter is taken from the template, and can be given as field:type
    */
    createInput(parent: HTMLElement, data: Record<string, string>, field: TemplateField, index: number = -1, initial: string = "") {

        const id = field.id
        const inputType = field.inputType

        /*
         * Some fields don't need UI...
         */
        // Moved currentdate into fields that *do* need UI!
        if (id === "currentTitle") return
        if (id === "currentPath") return

        // Create div and label
        const controlEl = parent.createEl('div', { cls: "from-template-section" })

        const labelText = index < 9 ? `${ucFirst(id)} (${index + 1}): ` : `${ucFirst(id)}: `
        const labelContainer = controlEl.createEl("div", { cls: "from-template-label" })
        const label = labelContainer.createEl("label", { text: labelText })
        label.htmlFor = id

        //console.log(`Creating field with initial: '${initial}'`,field)

        //Put the data into the record to start
        if (initial) data[field.id] = initial

        let element: HTMLElement

        if (inputType === "area") {
            console.log(field)
            const t = new TextAreaComponent(controlEl)
                .setValue(data[id])
                .onChange((value) => data[id] = value)
            t.inputEl.rows = 5
            element = t.inputEl
            if (field.args[0] && field.args[0].length)
                labelContainer.createEl("div", { text: field.args[0], cls: "from-template-description" })
        }
        else if (inputType === "text") {
            const initial = data[id] || (field.args.length ? field.args[0] : "")
            console.log(field)
            //console.log("Initial: ", initial)
            const t = new TextComponent(controlEl)
                .setValue(initial)
                .onChange((value) => data[id] = value)
            t.inputEl.size = 50
            element = t.inputEl
            if (field.args[1] && field.args[1].length)
                labelContainer.createEl("div", { text: field.args[1], cls: "from-template-description" })
        }
        else if (inputType === "choice") {
            const opts: Record<string, string> = {}
            field.args.forEach(f => opts[f] = ucFirst(f))
            const t = new DropdownComponent(controlEl)
                .addOptions(opts)
                .setValue(data[id])
                .onChange((value) => data[id] = value)
            element = t.selectEl
        }
        else if (inputType === "multi") {
            const selected: string[] = []
            const cont = controlEl.createSpan()
            field.args.forEach((f) => {
                const d = cont.createDiv({ text: f })
                const t = new ToggleComponent(d)
                    .setTooltip(f)
                    .onChange((value) => {
                        if (value) { selected.push(f) }
                        else { selected.remove(f) }
                        data[id] = selected.join(", ")
                    })
            })
            element = cont
        }
        /*
        else if( inputType === "search") {
            const t = new SearchComponent(controlEl)
            //.setValue(data[id])
            .onChange((value) => data[id] = value)
            t.inputEl.addClass("from-template-control")
        }
        else if( inputType === "moment") {
            const t = new MomentFormatComponent(controlEl)
            //.setValue(data[id])
            .onChange((value) => data[id] = value)
            t.inputEl.addClass("from-template-control")
        }
        */
        else if (inputType === "currentDate") {
            const fmt = field.args[0] || 'yyyy-MM-dd'
            const cur = DateTime.now().toFormat(fmt)
            data[id] = cur
            const t = new TextComponent(controlEl)
                .setValue(cur)
                .onChange((value) => data[id] = value)
            t.inputEl.size = 50
            element = t.inputEl
        }


        if (element) {
            if (index === 0) element.focus()
            element.addClass("from-template-control")
            if (index <= 8) this.scope.register(["Mod"], `${index + 1}`, () => element.focus())
        }

    }

    onClose() {
        let { contentEl } = this
        contentEl.empty()

    }
};

function ucFirst(s: string): string {
    return s[0].toUpperCase() + s.substring(1)
}