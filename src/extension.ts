'use strict';

import * as vscode from 'vscode';
import { selectedText } from './editor';
import { isJSX } from './modules/jsx';
import { ProviderResult } from 'vscode';
import { isStatelessComp, statelessToStatefulComponent } from './modules/statless-to-stateful';
import { isStatefulComp, statefulToStatelessComponent } from './modules/stateful-to-stateless';
import { extractToFile } from './modules/extract-to-file';
import { extractJSXToComponentToFile, extractJSXToComponent } from './modules/extract-to-component';

export class CompleteActionProvider implements vscode.CodeActionProvider {
  public provideCodeActions(): ProviderResult<vscode.Command[]> {
    const exportToFileAction = {
      command: 'extension.hottir',
      title: 'Export to File'
    };

    const text = selectedText()

    if (isJSX(text)) {
      return [{
        command: 'extension.hottir.react.extract-component-to-file',
        title: 'Extract Component to File'
      }, {
        command: 'extension.hottir.react.extract-component',
        title: 'Extract Component'
      }, {
        command: 'extension.hottir.react.render-conditionally',
        title: 'Render Conditionally'
      }];
    }

    if (isStatelessComp(text)) {
      return [
        exportToFileAction,
        {
          command: 'extension.hottir.react.stateless-to-stateful',
          title: 'Convert Function to Class Component'
        }]
    }

    if (isStatefulComp(text)) {
      return [exportToFileAction, {
        command: 'extension.hottir.react.stateful-to-stateless',
        title: 'Convert Class to Function Component'
      }]
    }

    return [exportToFileAction];
  }
}



export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.languages.registerCodeActionsProvider({ pattern: '**/*.*' }, new CompleteActionProvider()));

  vscode.commands.registerCommand('extension.hottir', extractToFile);

  vscode.commands.registerCommand('extension.hottir.react.extract-component-to-file', extractJSXToComponentToFile);

  vscode.commands.registerCommand('extension.hottir.react.extract-component', extractJSXToComponent);

  vscode.commands.registerCommand('extension.hottir.react.stateless-to-stateful', statelessToStatefulComponent);

  vscode.commands.registerCommand('extension.hottir.react.stateful-to-stateless', statefulToStatelessComponent);

}



// this method is called when your extension is deactivated
export function deactivate() {
}