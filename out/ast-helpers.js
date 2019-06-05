"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const t = require("@babel/types");
function getReactImportReference(ast) {
    return ast.program.body.find(statement => {
        return (t.isImportDeclaration(statement) && statement.source.value === "react");
    });
}
exports.getReactImportReference = getReactImportReference;
function isExportedDeclaration(ast) {
    return t.isExportNamedDeclaration(ast) || t.isExportDefaultDeclaration(ast);
}
exports.isExportedDeclaration = isExportedDeclaration;
//# sourceMappingURL=ast-helpers.js.map