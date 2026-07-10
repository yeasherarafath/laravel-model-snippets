"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
function parseVersion(v) {
    if (!v)
        return 0;
    const clean = v.replace(/^[^\d]+/, '').replace(/[xX]/g, '0');
    const m = clean.match(/^(\d+)\.?(\d+)?/);
    if (!m)
        return 0;
    return parseFloat(`${m[1]}.${m[2] || '0'}`);
}
function getLaravelVersion() {
    const config = vscode.workspace.getConfiguration('laravelEloquentSnippets');
    const override = config.get('laravelVersion', '');
    if (override)
        return override;
    const folders = vscode.workspace.workspaceFolders;
    if (!folders)
        return undefined;
    for (const folder of folders) {
        const composerPath = path.join(folder.uri.fsPath, 'composer.json');
        if (!fs.existsSync(composerPath))
            continue;
        try {
            const content = JSON.parse(fs.readFileSync(composerPath, 'utf-8'));
            const raw = content.require?.['laravel/framework']
                || content['require-dev']?.['laravel/framework'];
            if (!raw)
                continue;
            const m = String(raw).match(/(\d+)\.(\d+)/);
            if (m)
                return `${m[1]}.${m[2]}`;
        }
        catch { /* ignore */ }
    }
    return undefined;
}
function activate(context) {
    const verStr = getLaravelVersion();
    const curVer = verStr ? parseVersion(verStr) : 999;
    const snippetsPath = path.join(context.extensionPath, 'snippets', 'model.json');
    let snippets = {};
    try {
        snippets = JSON.parse(fs.readFileSync(snippetsPath, 'utf-8'));
    }
    catch {
        return;
    }
    const provider = vscode.languages.registerCompletionItemProvider({ language: 'php', scheme: 'file' }, {
        provideCompletionItems() {
            const items = [];
            for (const [name, entry] of Object.entries(snippets)) {
                if (name.startsWith('_'))
                    continue;
                const s = entry;
                if (!s.prefix || !s.body)
                    continue;
                if (curVer < parseVersion(s.versions?.since))
                    continue;
                const item = new vscode.CompletionItem(s.prefix, vscode.CompletionItemKind.Snippet);
                let detail = s.description || '';
                if (s.versions?.deprecated && curVer >= parseVersion(s.versions.deprecated)) {
                    let badge = `[Deprecated in ${s.versions.deprecated}`;
                    if (s.versions.alt)
                        badge += ` → Use ${s.versions.alt}`;
                    badge += ']';
                    detail = `${badge} ${detail}`;
                }
                item.detail = detail;
                if (s.placement === 'inside-class') {
                    item.insertText = '';
                    item.command = {
                        command: 'laravelEloquentSnippets.insertTrait',
                        title: '',
                        arguments: [s.import || [], s.body.join('\n')]
                    };
                }
                else {
                    item.insertText = new vscode.SnippetString(s.body.join('\n'));
                    if (s.import && s.import.length > 0) {
                        item.command = {
                            command: 'laravelEloquentSnippets.addImports',
                            title: '',
                            arguments: [s.import]
                        };
                    }
                }
                items.push(item);
            }
            return items;
        }
    }, ':');
    context.subscriptions.push(provider);
    const importCmd = vscode.commands.registerCommand('laravelEloquentSnippets.addImports', async (imports) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const doc = editor.document;
        const fullText = doc.getText();
        const edit = new vscode.WorkspaceEdit();
        let needsNewline = false;
        for (const importStmt of imports) {
            if (fullText.includes(importStmt))
                continue;
            edit.insert(doc.uri, findImportPosition(doc, fullText), importStmt + '\n');
            needsNewline = true;
        }
        if (needsNewline) {
            await vscode.workspace.applyEdit(edit);
        }
    });
    context.subscriptions.push(importCmd);
    const insertTraitCmd = vscode.commands.registerCommand('laravelEloquentSnippets.insertTrait', async (imports, body) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return;
        const doc = editor.document;
        const fullText = doc.getText();
        const importEdit = new vscode.WorkspaceEdit();
        let hasNewImports = false;
        for (const importStmt of imports) {
            if (fullText.includes(importStmt))
                continue;
            importEdit.insert(doc.uri, findImportPosition(doc, fullText), importStmt + '\n');
            hasNewImports = true;
        }
        if (hasNewImports) {
            await vscode.workspace.applyEdit(importEdit);
        }
        const traitMatch = body.match(/use\s+(\w+)/);
        if (!traitMatch)
            return;
        const traitName = traitMatch[1];
        if (fullText.includes('use ' + traitName + ';'))
            return;
        const bracePos = findClassOpenBrace(doc);
        if (!bracePos)
            return;
        await editor.insertSnippet(new vscode.SnippetString('\n\t' + body), bracePos);
    });
    context.subscriptions.push(insertTraitCmd);
}
function findImportPosition(doc, fullText) {
    const lines = doc.getText().split('\n');
    let lastUseLine = -1;
    for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim();
        if (t.startsWith('use ') && t.endsWith(';')) {
            lastUseLine = i;
        }
        if (t.startsWith('class ') || t.startsWith('enum ') || t.startsWith('interface ') || t.startsWith('trait ')) {
            break;
        }
    }
    if (lastUseLine >= 0) {
        return new vscode.Position(lastUseLine + 1, 0);
    }
    const phpOpen = fullText.indexOf('<?php');
    if (phpOpen >= 0) {
        const line = doc.positionAt(phpOpen).line;
        return new vscode.Position(line + 1, 0);
    }
    return new vscode.Position(0, 0);
}
function findClassOpenBrace(doc) {
    const lines = doc.getText().split('\n');
    for (let i = 0; i < lines.length; i++) {
        const t = lines[i].trim();
        if (/^(class|enum|interface|trait)\s/.test(t)) {
            for (let j = i; j < lines.length; j++) {
                const col = lines[j].indexOf('{');
                if (col >= 0) {
                    return new vscode.Position(j, col + 1);
                }
            }
        }
    }
    return undefined;
}
function deactivate() { }
//# sourceMappingURL=extension.js.map