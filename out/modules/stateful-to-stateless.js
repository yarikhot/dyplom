"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const parsing_1 = require("../parsing");
const traverse_1 = require("@babel/traverse");
const template_1 = require("@babel/template");
const t = require("@babel/types");
const core_1 = require("@babel/core");
const utils_1 = require("../utils");
const settings_1 = require("../settings");
const ast_helpers_1 = require("../ast-helpers");
const editor_1 = require("../editor");
const code_actions_1 = require("../code-actions");
const file_system_1 = require("../file-system");
const vscode_1 = require("vscode");
const buildStateHook = template_1.default(`
const [STATE_PROP, STATE_SETTER] = useState(STATE_VALUE);
`);
const buildEffectHook = template_1.default(`
useEffect(() =>  { EFFECT });
`);
function statefulToStateless(component) {
    const functionBody = [];
    const stateProperties = new Map();
    const RemoveThisVisitor = {
        MemberExpression(path) {
            if (t.isThisExpression(path.node.object)) {
                path.replaceWith(path.node.property);
            }
        }
    };
    const ReplaceStateWithPropsVisitor = {
        MemberExpression(path) {
            if (settings_1.isHooksForFunctionalComponentsExperimentOn()) {
                if (t.isThisExpression(path.node.object.object) && path.node.object.property.name === 'state') {
                    const stateVariable = path.node.property.name;
                    if (!stateProperties.has(stateVariable)) {
                        stateProperties.set(stateVariable, void 0);
                    }
                    path.replaceWith(t.identifier(stateVariable));
                }
            }
            else {
                if (t.isThisExpression(path.node.object) && path.node.property.name === 'state') {
                    path.node.property.name = 'props';
                }
            }
        }
    };
    const RemoveSetStateAndForceUpdateVisitor = {
        CallExpression(path) {
            if (t.isMemberExpression(path.node.callee)) {
                if (t.isThisExpression(path.node.callee.object)) {
                    if (settings_1.isHooksForFunctionalComponentsExperimentOn()) {
                        if (path.node.callee.property.name === 'forceUpdate') {
                            path.remove();
                        }
                        else if (path.node.callee.property.name === 'setState') {
                            const buildRequire = template_1.default(`
              STATE_SETTER(STATE_VALUE);
            `);
                            path.node.arguments[0].properties.forEach(({ key, value }) => {
                                path.insertBefore(buildRequire({
                                    STATE_SETTER: t.identifier(`set${utils_1.capitalizeFirstLetter(key.name)}`),
                                    STATE_VALUE: value
                                }));
                                stateProperties.set(key.name, value);
                            });
                            path.remove();
                        }
                    }
                    else {
                        if (['setState', 'forceUpdate'].indexOf(path.node.callee.property.name) !== -1) {
                            path.remove();
                        }
                    }
                }
            }
        }
    };
    let stateHooksPresent = false;
    let effectBody, effectTeardown;
    const lifecycleMethods = [
        'constructor',
        'componentWillMount',
        'componentDidMount',
        'componentWillReceiveProps',
        'shouldComponentUpdate',
        'componentWillUpdate',
        'componentDidUpdate',
        'componentWillUnmount',
        'componentDidCatch',
        'getDerivedStateFromProps'
    ];
    const arrowFunction = ({ name, params = [], propType = null, paramDefaults = [], body = [] }) => {
        const identifier = t.identifier(name);
        addPropTSAnnotationIfNeeded(propType, identifier);
        return t.variableDeclaration('const', [
            t.variableDeclarator(identifier, t.arrowFunctionExpression(params.map((param, idx) => {
                const paramIdentifier = t.identifier(param);
                let paramObj = paramIdentifier;
                if (paramDefaults[idx]) {
                    paramObj = t.assignmentPattern(paramIdentifier, paramDefaults[idx]);
                }
                return paramObj;
            }), t.blockStatement(body)))
        ]);
    };
    const copyNonLifeCycleMethods = (path) => {
        const methodName = path.node.key.name;
        const classBody = t.isClassMethod(path) ? path['node'].body.body : path.node.value.body.body;
        if (!lifecycleMethods.includes(methodName)) {
            path.traverse(RemoveSetStateAndForceUpdateVisitor);
            path.traverse(ReplaceStateWithPropsVisitor);
            path.traverse(RemoveThisVisitor);
            appendFunctionBodyToStatelessComponent(methodName, classBody);
        }
        else if (settings_1.isHooksForFunctionalComponentsExperimentOn()) {
            if (methodName === 'componentDidMount') {
                path.traverse(RemoveSetStateAndForceUpdateVisitor);
                path.traverse(ReplaceStateWithPropsVisitor);
                path.traverse(RemoveThisVisitor);
                effectBody = path.node.body;
            }
            else if (methodName === 'componentWillUnmount') {
                path.traverse(RemoveSetStateAndForceUpdateVisitor);
                path.traverse(ReplaceStateWithPropsVisitor);
                path.traverse(RemoveThisVisitor);
                effectTeardown = path.node.body;
            }
        }
    };
    const appendFunctionBodyToStatelessComponent = (name, body) => {
        if (name !== 'render') {
            functionBody.push(arrowFunction({ name, body }));
        }
        else {
            functionBody.push(...body);
        }
    };
    const visitor = {
        ClassDeclaration(path) {
            const statelessComponentName = path.node.id.name;
            const defaultPropsPath = path.get('body').get('body').find(property => {
                return t.isClassProperty(property) && property['node'].key.name === 'defaultProps';
            });
            const statelessComponent = arrowFunction({
                name: (statelessComponentName),
                params: ['props'],
                propType: path.node.superTypeParameters && path.node.superTypeParameters.params.length ? path.node.superTypeParameters.params : null,
                paramDefaults: defaultPropsPath ? [defaultPropsPath.node.value] : [],
                body: functionBody
            });
            const isExportDefaultDeclaration = t.isExportDefaultDeclaration(path.container);
            const isExportNamedDeclaration = t.isExportNamedDeclaration(path.container);
            const exportDefaultStatelessComponent = t.exportDefaultDeclaration(t.identifier(statelessComponentName));
            const exportNamedStatelessComponent = t.exportNamedDeclaration(statelessComponent, []);
            const mainPath = t.isExportDeclaration(path.container) ? path.findParent(p => t.isExportDeclaration(p)) : path;
            if (isExportDefaultDeclaration) {
                mainPath.insertBefore(statelessComponent);
                mainPath.insertBefore(exportDefaultStatelessComponent);
            }
            else if (isExportNamedDeclaration) {
                mainPath.insertBefore(exportNamedStatelessComponent);
            }
            else {
                mainPath.insertBefore(statelessComponent);
            }
        },
        ClassMethod(path) {
            if (settings_1.isHooksForFunctionalComponentsExperimentOn()) {
                if (path.node.kind === "constructor") {
                    const { expression = null } = path.node.body.body.find((bodyStatement => {
                        return t.isAssignmentExpression(bodyStatement.expression);
                    })) || {};
                    if (expression && expression.left.property.name === "state") {
                        stateHooksPresent = true;
                        expression.right.properties.map(({ key, value }) => {
                            stateProperties.set(key.name, value);
                        });
                    }
                }
            }
            copyNonLifeCycleMethods(path);
        },
        ClassProperty(path) {
            const propValue = path.node.value;
            if (t.isFunctionExpression(propValue) || t.isArrowFunctionExpression(propValue)) {
                copyNonLifeCycleMethods(path);
            }
        },
        ImportDeclaration(path) {
            if (path.node.source.value === 'react') {
            }
        }
    };
    const ast = parsing_1.codeToAst(component);
    const hasComponentDidUpdate = (node) => {
        const classDeclaration = ast_helpers_1.isExportedDeclaration(node) ? node.declaration : ast.program.body[0];
        return Boolean(classDeclaration.body.body.find(node => t.isClassMethod(node) && node.key.name === 'componentDidUpdate'));
    };
    traverse_1.default(ast, visitor);
    if (settings_1.isHooksForFunctionalComponentsExperimentOn()) {
        if ((effectBody || effectTeardown)) {
            const expressions = [];
            if (effectBody) {
                expressions.push(...effectBody.body);
            }
            if (effectTeardown) {
                expressions.push(t.returnStatement(t.arrowFunctionExpression([], effectTeardown)));
            }
            const lifecycleEffectHook = buildEffectHook({ EFFECT: expressions });
            // if(!(hasComponentDidUpdate(ast.program.body[0]))){
            //   lifecycleEffectHook.expression.arguments.push(t.arrayExpression([]));
            // }
            lifecycleEffectHook.expression.arguments.push(t.arrayExpression([]));
            functionBody.unshift(lifecycleEffectHook);
        }
        const hookExpressions = Array.from(stateProperties).map(([key, defaultValue]) => {
            return buildStateHook({
                STATE_PROP: t.identifier(key),
                STATE_SETTER: t.identifier(`set${utils_1.capitalizeFirstLetter(key)}`),
                STATE_VALUE: defaultValue
            });
        });
        functionBody.unshift(...hookExpressions);
    }
    ast.program.body.splice(-1);
    const processedJSX = core_1.transformFromAst(ast).code;
    return {
        text: processedJSX,
        metadata: {
            stateHooksPresent
        }
    };
}
exports.statefulToStateless = statefulToStateless;
function addPropTSAnnotationIfNeeded(typeAnnotation, identifier) {
    if (typeAnnotation) {
        identifier.typeAnnotation = resolveTypeAnnotation(typeAnnotation);
    }
}
function resolveTypeAnnotation(propType) {
    let typeAnnotation;
    const hasTypeReferences = propType.some(annotation => t.isTSTypeReference(annotation));
    if (hasTypeReferences) {
        if (propType.length > 1) {
            typeAnnotation = t.tsIntersectionType(propType);
        }
        else {
            typeAnnotation = propType[0];
        }
    }
    else {
        const members = propType.reduce((acc, typeLiteral) => {
            return [...acc, ...typeLiteral.members];
        }, []);
        typeAnnotation = t.tsTypeLiteral(members);
    }
    const componentTypeAnnotation = settings_1.isHooksForFunctionalComponentsExperimentOn() ? 'FC' : 'SFC';
    return t.tsTypeAnnotation(t.tsTypeReference(t.identifier(componentTypeAnnotation), t.tsTypeParameterInstantiation([typeAnnotation])));
    ;
}
function statefulToStatelessComponent() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            const answer = yield editor_1.showInformationMessage('WARNING! All lifecycle methods and react instance methods would be removed. Are you sure you want to continue?', ['Yes', 'No']);
            if (answer === 'Yes') {
                const selectionProccessingResult = statefulToStateless(editor_1.selectedText());
                const persistantChanges = [code_actions_1.replaceSelectionWith(selectionProccessingResult.text)];
                if (selectionProccessingResult.metadata.stateHooksPresent) {
                    persistantChanges.push(importStateHook());
                }
                yield file_system_1.persistFileSystemChanges(...persistantChanges);
            }
        }
        catch (e) {
            code_actions_1.handleError(e);
        }
        function importStateHook() {
            const currentFile = editor_1.activeURI().path;
            const file = file_system_1.readFileContent(currentFile);
            const ast = parsing_1.codeToAst(file);
            const reactImport = ast_helpers_1.getReactImportReference(ast);
            reactImport.specifiers.push(t.importSpecifier(t.identifier('useState'), t.identifier('useState')));
            const updatedReactImport = core_1.transformFromAst(t.program([reactImport])).code;
            return file_system_1.replaceTextInFile(updatedReactImport, new vscode_1.Position(reactImport.loc.start.line, reactImport.loc.start.column), new vscode_1.Position(reactImport.loc.end.line, reactImport.loc.end.column), editor_1.activeFileName());
        }
    });
}
exports.statefulToStatelessComponent = statefulToStatelessComponent;
function isStatefulComp(code) {
    const ast = parsing_1.templateToAst(code);
    const isSupportedComponent = classPath => {
        const supportedComponents = ["Component", "PureComponent"];
        if (!classPath) {
            return false;
        }
        return (classPath.superClass && ((classPath.superClass.object &&
            classPath.superClass.object.name === "React" &&
            supportedComponents.indexOf(classPath.superClass.property.name) !==
                -1) ||
            supportedComponents.indexOf(classPath.superClass.name) !== -1));
    };
    return ((ast_helpers_1.isExportedDeclaration(ast) && isSupportedComponent(ast.declaration)) ||
        isSupportedComponent(ast));
}
exports.isStatefulComp = isStatefulComp;
//# sourceMappingURL=stateful-to-stateless.js.map