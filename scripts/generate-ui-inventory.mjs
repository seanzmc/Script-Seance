#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import ts from 'typescript';

const rootDir = process.cwd();
const docsDir = path.join(rootDir, 'docs');
const inventoryDir = path.join(docsDir, 'ui-inventory');
const penpotDir = path.join(inventoryDir, 'penpot-pack');

const asPosix = (value) => value.split(path.sep).join('/');
const rel = (abs) => asPosix(path.relative(rootDir, abs));
const exists = (p) => {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
};

const walkFiles = (dir, out = []) => {
  if (!exists(dir)) return out;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, out);
      continue;
    }
    out.push(full);
  }
  return out;
};

const allCodeFiles = [
  ...walkFiles(path.join(rootDir, 'components')).filter((f) => /\.(ts|tsx)$/i.test(f)),
  ...walkFiles(path.join(rootDir, 'services')).filter((f) => /\.(ts|tsx)$/i.test(f)),
  ...walkFiles(path.join(rootDir, 'hooks')).filter((f) => /\.(ts|tsx)$/i.test(f)),
  ...walkFiles(path.join(rootDir, 'tests')).filter((f) => /\.(ts|tsx)$/i.test(f)),
  path.join(rootDir, 'App.tsx'),
  path.join(rootDir, 'index.tsx'),
].filter((f, idx, arr) => exists(f) && arr.indexOf(f) === idx);

const tsxComponentFiles = [
  ...walkFiles(path.join(rootDir, 'components')).filter((f) => /\.tsx$/i.test(f)),
  path.join(rootDir, 'App.tsx'),
].filter((f, idx, arr) => exists(f) && arr.indexOf(f) === idx);

const parseSource = (filePath) => {
  const content = fs.readFileSync(filePath, 'utf8');
  const source = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return { content, source };
};

const sourceByFile = new Map(allCodeFiles.map((file) => {
  const kind = file.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const content = fs.readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, kind);
  return [file, { content, source }];
}));

const resolveImport = (fromFile, specifier) => {
  if (!specifier.startsWith('.')) return null;
  const base = path.resolve(path.dirname(fromFile), specifier);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.js`,
    `${base}.jsx`,
    `${base}.mjs`,
    `${base}.cjs`,
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    path.join(base, 'index.js'),
    path.join(base, 'index.jsx'),
  ];
  for (const candidate of candidates) {
    if (exists(candidate) && fs.statSync(candidate).isFile()) {
      return path.resolve(candidate);
    }
  }
  return null;
};

const importUsageByFile = new Map();
const getImportUsageBucket = (resolvedFile) => {
  if (!importUsageByFile.has(resolvedFile)) {
    importUsageByFile.set(resolvedFile, {
      default: new Set(),
      named: new Map(),
      namespace: new Set(),
    });
  }
  return importUsageByFile.get(resolvedFile);
};

for (const filePath of allCodeFiles) {
  const { source } = sourceByFile.get(filePath);
  source.forEachChild((node) => {
    if (!ts.isImportDeclaration(node) || !node.moduleSpecifier || !ts.isStringLiteral(node.moduleSpecifier)) {
      return;
    }
    const spec = node.moduleSpecifier.text;
    const resolved = resolveImport(filePath, spec);
    if (!resolved) return;
    const clause = node.importClause;
    if (!clause) return;
    const bucket = getImportUsageBucket(resolved);
    const importer = rel(filePath);

    if (clause.name) {
      bucket.default.add(importer);
    }

    if (clause.namedBindings) {
      if (ts.isNamespaceImport(clause.namedBindings)) {
        bucket.namespace.add(importer);
      } else {
        for (const element of clause.namedBindings.elements) {
          const importedName = (element.propertyName || element.name).text;
          if (!bucket.named.has(importedName)) {
            bucket.named.set(importedName, new Set());
          }
          bucket.named.get(importedName).add(importer);
        }
      }
    }
  });
}

const hasExportModifier = (node) => {
  const modifiers = node.modifiers || [];
  return modifiers.some((mod) => mod.kind === ts.SyntaxKind.ExportKeyword);
};

const hasDefaultModifier = (node) => {
  const modifiers = node.modifiers || [];
  return modifiers.some((mod) => mod.kind === ts.SyntaxKind.DefaultKeyword);
};

const isUpperName = (name) => Boolean(name) && /^[A-Z]/.test(name);

const nodeHasJsx = (node) => {
  let found = false;
  const visit = (child) => {
    if (found) return;
    if (
      ts.isJsxElement(child) ||
      ts.isJsxSelfClosingElement(child) ||
      ts.isJsxFragment(child)
    ) {
      found = true;
      return;
    }
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(node, visit);
  return found;
};

const getTypeText = (node, source) => node ? node.getText(source).trim() : 'unknown';

const parseInterfaceMembers = (interfaceDecl, source) => {
  const props = [];
  for (const member of interfaceDecl.members) {
    if (!ts.isPropertySignature(member) || !member.name) continue;
    let name = '';
    if (ts.isIdentifier(member.name) || ts.isStringLiteral(member.name)) {
      name = member.name.text;
    } else {
      name = member.name.getText(source);
    }
    props.push({
      name,
      type: getTypeText(member.type, source),
      optional: Boolean(member.questionToken),
    });
  }
  const extendsTypes = (interfaceDecl.heritageClauses || [])
    .flatMap((clause) => clause.types.map((t) => t.getText(source).trim()));
  return { props, extendsTypes };
};

const mergePropLists = (lists) => {
  const seen = new Map();
  for (const list of lists) {
    for (const item of list) {
      if (!seen.has(item.name)) {
        seen.set(item.name, item);
      }
    }
  }
  return [...seen.values()];
};

const resolvePropsType = (typeNode, source, interfaces) => {
  if (!typeNode) {
    return { propsType: 'none', props: [], extendsTypes: [] };
  }

  if (ts.isTypeReferenceNode(typeNode)) {
    const typeName = typeNode.typeName.getText(source).trim();
    if ((typeName === 'React.FC' || typeName === 'FC' || typeName === 'React.FunctionComponent') && typeNode.typeArguments?.[0]) {
      return resolvePropsType(typeNode.typeArguments[0], source, interfaces);
    }
    if (interfaces.has(typeName)) {
      const iface = interfaces.get(typeName);
      return {
        propsType: typeName,
        props: iface.props,
        extendsTypes: iface.extendsTypes,
      };
    }
    return {
      propsType: typeName,
      props: [],
      extendsTypes: [],
      unresolved: true,
    };
  }

  if (ts.isTypeLiteralNode(typeNode)) {
    const props = [];
    for (const member of typeNode.members) {
      if (!ts.isPropertySignature(member) || !member.name) continue;
      const name = member.name.getText(source).replace(/['"]/g, '');
      props.push({
        name,
        type: getTypeText(member.type, source),
        optional: Boolean(member.questionToken),
      });
    }
    return {
      propsType: 'inline',
      props,
      extendsTypes: [],
    };
  }

  if (ts.isIntersectionTypeNode(typeNode)) {
    const pieces = typeNode.types.map((piece) => resolvePropsType(piece, source, interfaces));
    return {
      propsType: pieces.map((piece) => piece.propsType).join(' & '),
      props: mergePropLists(pieces.map((piece) => piece.props)),
      extendsTypes: pieces.flatMap((piece) => piece.extendsTypes || []),
    };
  }

  if (ts.isParenthesizedTypeNode(typeNode)) {
    return resolvePropsType(typeNode.type, source, interfaces);
  }

  return {
    propsType: getTypeText(typeNode, source),
    props: [],
    extendsTypes: [],
    unresolved: true,
  };
};

const resolvePropsFromParam = (param, source, interfaces) => {
  if (!param) {
    return { propsType: 'none', props: [], extendsTypes: [] };
  }
  if (param.type) {
    return resolvePropsType(param.type, source, interfaces);
  }
  if (ts.isObjectBindingPattern(param.name)) {
    const props = param.name.elements
      .map((el) => {
        const nameNode = el.propertyName || el.name;
        if (!nameNode) return null;
        const name = nameNode.getText(source).replace(/['"]/g, '');
        return {
          name,
          type: 'unknown',
          optional: Boolean(el.dotDotDotToken) || Boolean(el.initializer),
        };
      })
      .filter(Boolean);
    return { propsType: 'destructured-implicit', props, extendsTypes: [] };
  }
  return { propsType: 'unknown', props: [], extendsTypes: [], unresolved: true };
};

const classifyComponent = (name) => {
  if (name === 'App') return 'pages/screens';
  if (['ScriptPane', 'ScriptDisplay', 'BottomToolbelt'].includes(name)) return 'layout';
  if (['Button', 'HighlightIcon'].includes(name)) return 'primitives';
  return 'composed widgets';
};

const getLine = (source, pos) => source.getLineAndCharacterOfPosition(pos).line + 1;

const components = [];
const localIdentifierUsage = new Map();

for (const filePath of tsxComponentFiles) {
  const { source, content } = sourceByFile.get(filePath);
  const interfaces = new Map();

  source.forEachChild((node) => {
    if (ts.isInterfaceDeclaration(node)) {
      interfaces.set(node.name.text, parseInterfaceMembers(node, source));
    }
  });

  const pushComponent = (entry) => {
    components.push({
      ...entry,
      filePath: rel(filePath),
      category: classifyComponent(entry.name),
      usedBy: [],
    });
  };

  source.forEachChild((node) => {
    if (ts.isFunctionDeclaration(node) && node.name && isUpperName(node.name.text) && nodeHasJsx(node)) {
      const propsInfo = resolvePropsFromParam(node.parameters[0], source, interfaces);
      pushComponent({
        name: node.name.text,
        line: getLine(source, node.getStart(source)),
        isExported: hasExportModifier(node) || hasDefaultModifier(node),
        isDefaultExport: hasDefaultModifier(node),
        propsType: propsInfo.propsType,
        propsExtends: propsInfo.extendsTypes,
        props: propsInfo.props,
      });
      return;
    }

    if (ts.isVariableStatement(node)) {
      const exported = hasExportModifier(node);
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name) || !isUpperName(decl.name.text) || !decl.initializer) continue;
        const init = decl.initializer;
        const maybeComponent =
          (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) && nodeHasJsx(init);
        const maybeReactFc = decl.type && /(^|\b)(React\.)?(FC|FunctionComponent)\b/.test(decl.type.getText(source));
        if (!maybeComponent && !maybeReactFc) continue;

        let propsInfo = { propsType: 'none', props: [], extendsTypes: [] };
        if (decl.type) {
          propsInfo = resolvePropsType(decl.type, source, interfaces);
        } else if (ts.isArrowFunction(init) || ts.isFunctionExpression(init)) {
          propsInfo = resolvePropsFromParam(init.parameters[0], source, interfaces);
        }

        pushComponent({
          name: decl.name.text,
          line: getLine(source, decl.getStart(source)),
          isExported: exported,
          isDefaultExport: false,
          propsType: propsInfo.propsType,
          propsExtends: propsInfo.extendsTypes,
          props: propsInfo.props,
        });
      }
    }
  });

  const localNameCount = new Map();
  for (const component of components.filter((c) => c.filePath === rel(filePath))) {
    const regex = new RegExp(`\\b${component.name}\\b`, 'g');
    const matches = content.match(regex);
    localNameCount.set(component.name, matches ? matches.length : 0);
  }

  for (const component of components.filter((c) => c.filePath === rel(filePath))) {
    const key = `${path.resolve(rootDir, component.filePath)}::${component.name}`;
    localIdentifierUsage.set(key, localNameCount.get(component.name) || 0);
  }
}

components.sort((a, b) => {
  const fileCmp = a.filePath.localeCompare(b.filePath);
  if (fileCmp !== 0) return fileCmp;
  return a.line - b.line;
});

for (const component of components) {
  const absFile = path.resolve(rootDir, component.filePath);
  const usage = importUsageByFile.get(absFile);
  const usedBy = new Set();
  if (component.isExported && usage) {
    if (component.isDefaultExport) {
      for (const importer of usage.default) usedBy.add(importer);
    } else {
      const namedUsage = usage.named.get(component.name);
      if (namedUsage) {
        for (const importer of namedUsage) usedBy.add(importer);
      }
    }
    for (const importer of usage.namespace) {
      usedBy.add(importer);
    }
  }
  component.usedBy = [...usedBy].sort();
  if (component.isExported) {
    component.appearsUnused = component.usedBy.length === 0;
  } else {
    const key = `${absFile}::${component.name}`;
    component.appearsUnused = (localIdentifierUsage.get(key) || 0) <= 1;
  }
}

const readPackage = JSON.parse(fs.readFileSync(path.join(rootDir, 'package.json'), 'utf8'));
const deps = {
  ...(readPackage.dependencies || {}),
  ...(readPackage.devDependencies || {}),
};

let routingSystem = {
  type: 'manual-history',
  library: 'none',
  notes: 'No React Router/Next.js dependency; route state managed via window.history and pathname checks in App.tsx.',
};
if (deps['react-router-dom'] || deps['react-router']) {
  routingSystem = {
    type: 'react-router',
    library: deps['react-router-dom'] ? 'react-router-dom' : 'react-router',
    notes: 'Router dependency detected in package.json.',
  };
}
if (deps.next) {
  routingSystem = {
    type: 'nextjs',
    library: 'next',
    notes: 'Next.js dependency detected in package.json.',
  };
}

const screens = [
  {
    route: '/',
    topLevelComponent: 'App',
    fileRef: 'App.tsx:1311',
    regions: [
      {
        name: 'App shell',
        description: 'Full-height root container with dark theme, overflow clipping, and relative positioning for overlays.',
        fileRef: 'App.tsx:1311',
      },
      {
        name: 'Main workspace',
        description: 'Primary editor and screenplay layout rendered through ScriptPane.',
        fileRef: 'App.tsx:1312',
      },
      {
        name: 'Transient toast lane',
        description: 'Bottom-centered feedback toast with optional undo action.',
        fileRef: 'App.tsx:1388',
      },
      {
        name: 'Global modals',
        description: 'Voice casting modal and login modal mounted at app root to overlay any state.',
        fileRef: 'App.tsx:1405',
      },
    ],
  },
  {
    route: '/privacy',
    topLevelComponent: 'App + PrivacyModal overlay',
    fileRef: 'App.tsx:408',
    regions: [
      {
        name: 'Base workspace',
        description: 'Same workspace as `/`, preserved behind modal.',
        fileRef: 'App.tsx:1311',
      },
      {
        name: 'Privacy modal overlay',
        description: 'Full-screen backdrop + centered privacy dialog toggled by pathname `/privacy`.',
        fileRef: 'App.tsx:1307',
      },
    ],
  },
];

const classEntries = [];
const classEntrySeen = new Set();
const spacingCount = new Map();
const radiusCount = new Map();
const shadowCount = new Map();

const addTokenCount = (map, token) => map.set(token, (map.get(token) || 0) + 1);

const collectClassStrings = (filePath, source) => {
  const fileRel = rel(filePath);
  const addClassText = (text, pos) => {
    const cleaned = text.replace(/\s+/g, ' ').trim();
    if (!cleaned) return;
    const line = getLine(source, pos);
    const dedupeKey = `${fileRel}:${line}:${cleaned}`;
    if (classEntrySeen.has(dedupeKey)) return;
    classEntrySeen.add(dedupeKey);
    classEntries.push({
      filePath: fileRel,
      line,
      classText: cleaned,
    });
    const tokens = cleaned.split(/\s+/).filter(Boolean);
    for (const token of tokens) {
      if (/^(p|px|py|pt|pb|pl|pr|m|mx|my|mt|mb|ml|mr|gap|space-x|space-y)-/.test(token)) {
        addTokenCount(spacingCount, token);
      }
      if (/^rounded(?:-[^\s]+)?$/.test(token)) {
        addTokenCount(radiusCount, token);
      }
      if (/^shadow(?:-[^\s]+)?$/.test(token) || /^shadow\[/.test(token)) {
        addTokenCount(shadowCount, token);
      }
    }
  };

  const extractStrings = (node) => {
    const out = [];
    const visit = (n) => {
      if (ts.isStringLiteralLike(n)) {
        out.push(n.text);
        return;
      }
      if (ts.isNoSubstitutionTemplateLiteral(n)) {
        out.push(n.text);
        return;
      }
      if (ts.isTemplateExpression(n)) {
        let assembled = n.head.text;
        for (const span of n.templateSpans) {
          assembled += ' ';
          assembled += span.literal.text;
        }
        out.push(assembled);
        return;
      }
      if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.PlusToken) {
        visit(n.left);
        visit(n.right);
        return;
      }
      ts.forEachChild(n, visit);
    };
    visit(node);
    return out;
  };

  const visit = (node) => {
    if (ts.isJsxAttribute(node) && node.name.text === 'className' && node.initializer) {
      if (ts.isStringLiteral(node.initializer)) {
        addClassText(node.initializer.text, node.initializer.getStart(source));
      } else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
        const strings = extractStrings(node.initializer.expression);
        for (const str of strings) addClassText(str, node.initializer.getStart(source));
      }
    }

    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const text = node.text;
      if (/\b(bg-|text-|border-|rounded|shadow|px-|py-|gap-)/.test(text) && text.includes(' ')) {
        addClassText(text, node.getStart(source));
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(source);
};

for (const filePath of tsxComponentFiles) {
  const { source } = sourceByFile.get(filePath);
  collectClassStrings(filePath, source);
}

const topTokens = (map, limit = 12) => [...map.entries()]
  .sort((a, b) => b[1] - a[1])
  .slice(0, limit)
  .map(([token, count]) => ({ token, count }));

const patternDefs = [
  {
    id: 'card_dark_container',
    name: 'Dark Card Container',
    description: 'Rounded dark cards with border and shadow used for panels and shells.',
    matcher: (text) => /rounded-2xl/.test(text) && /border/.test(text) && /(bg-gray-900|bg-gray-950|bg-slate-9)/.test(text),
  },
    {
      id: 'modal_overlay',
      name: 'Modal Backdrop Overlay',
      description: 'Fixed full-screen backdrop with dimming and blur.',
      matcher: (text) => /inset-0/.test(text) && /backdrop-blur/.test(text),
    },
  {
    id: 'modal_surface',
    name: 'Modal Surface',
    description: 'Centered dialog panel with radius, border, and heavy shadow.',
    matcher: (text) => /max-w-/.test(text) && /rounded-2xl/.test(text) && /shadow-2xl/.test(text),
  },
  {
    id: 'button_primary',
    name: 'Primary Button',
    description: 'Indigo CTA buttons with white text and hover state.',
    matcher: (text) => /bg-indigo-600/.test(text) && /text-white/.test(text),
  },
  {
    id: 'button_secondary',
    name: 'Secondary Button',
    description: 'Gray utility buttons with subtle hover and border.',
    matcher: (text) => /(bg-gray-700|bg-gray-800)/.test(text) && /(text-gray-100|text-gray-300)/.test(text),
  },
  {
    id: 'button_ghost',
    name: 'Ghost Button',
    description: 'Low-emphasis text action with transparent background and hover tint.',
    matcher: (text) => /hover:bg-gray-800/.test(text) && /(text-gray-400|text-gray-500)/.test(text),
  },
  {
    id: 'input_dark_field',
    name: 'Dark Input Field',
    description: 'Input/textarea controls using dark fill, gray border, and indigo focus ring.',
    matcher: (text) => /(bg-gray-950|bg-slate-900)/.test(text) && /border-gray-700/.test(text) && /focus:ring-1|focus:ring-2/.test(text),
  },
  {
    id: 'tool_button_chip',
    name: 'Toolbelt Chip Button',
    description: 'Uppercase compact buttons used in toolbelt and utility strips.',
    matcher: (text) => /uppercase/.test(text) && /tracking/.test(text) && /rounded/.test(text) && /text-\[10px\]/.test(text),
  },
  {
    id: 'script_paper_canvas',
    name: 'Script Paper Canvas',
    description: 'Off-white screenplay canvas with border, texture, and drop shadow.',
    matcher: (text) => /bg\[#f6f1e7\]/.test(text) || /script-export-root/.test(text),
  },
  {
    id: 'toggle_switch',
    name: 'Toggle Switch',
    description: 'Two-state switch with rounded track and sliding knob.',
    matcher: (text) => /w-8\s+h-4\s+rounded-full/.test(text) || /translate-x-4/.test(text),
  },
];

const patterns = patternDefs.map((pattern) => {
  const occurrences = classEntries
    .filter((entry) => pattern.matcher(entry.classText))
    .slice(0, 20)
    .map((entry) => ({
      filePath: `${entry.filePath}:${entry.line}`,
      classSnippet: entry.classText,
    }));
  return {
    id: pattern.id,
    name: pattern.name,
    description: pattern.description,
    count: occurrences.length,
    occurrences,
  };
}).sort((a, b) => b.count - a.count);

const topConsolidationPatterns = patterns.slice(0, 10);

const stylesJson = {
  stylingApproach: {
    primary: 'Tailwind utility classes in TSX',
    globalCss: ['index.css'],
    cssInJs: ['components/ScriptDisplay.tsx (print/export style string)', 'components/VoiceCastingModal.tsx (inline keyframes)'],
    detectedLibraries: {
      tailwind: Boolean(deps.tailwindcss),
      cssModules: false,
      styledComponents: false,
      mui: false,
    },
  },
  tokenSources: [
    { path: 'tailwind.config.js', description: 'Tailwind content paths and fontFamily extension.' },
    { path: 'index.css', description: 'Global body colors/fonts and scrollbar styling.' },
    { path: 'index.html', description: 'Google font loading (Inter, Courier Prime).' },
    { path: 'components/ScriptDisplay.tsx', description: 'Export/print typography and paper styling constants.' },
  ],
  repeatedValues: {
    spacing: topTokens(spacingCount, 18),
    radius: topTokens(radiusCount, 14),
    shadow: topTokens(shadowCount, 12),
  },
  patterns: topConsolidationPatterns,
};

const componentsJson = {
  generatedAt: new Date().toISOString(),
  componentCount: components.length,
  components: components.map((component) => ({
    componentName: component.name,
    filePath: component.filePath,
    line: component.line,
    category: component.category,
    exported: component.isExported,
    defaultExport: component.isDefaultExport,
    propsType: component.propsType,
    extends: component.propsExtends,
    props: component.props,
    usedBy: component.usedBy,
    appearsUnused: component.appearsUnused,
  })),
};

const screensJson = {
  generatedAt: new Date().toISOString(),
  routingSystem,
  screens,
};

const recommendationComponents = [
  {
    name: 'AppShell',
    mapsTo: ['App', 'ScriptPane'],
    purpose: 'Single page shell + region framing for header, content, and overlays.',
  },
  {
    name: 'SurfaceCard',
    mapsTo: ['BottomToolbelt', 'SetupForm', 'PlaybackPanel'],
    purpose: 'Unified bordered/radius panel container with dark variants.',
  },
  {
    name: 'Button',
    mapsTo: ['Button'],
    purpose: 'Primary/secondary/ghost/accent action control.',
  },
  {
    name: 'InputField',
    mapsTo: ['LoginModal', 'TitleEditModal', 'InsertBlock'],
    purpose: 'Standardized text input/textarea/select visual states.',
  },
  {
    name: 'Modal',
    mapsTo: ['LoginModal', 'PrivacyModal', 'TitleEditModal', 'VoiceCastingModal'],
    purpose: 'Shared overlay, dialog container, header, and footer structure.',
  },
  {
    name: 'TopBar',
    mapsTo: ['ScriptPane header'],
    purpose: 'Draft metadata and global actions strip.',
  },
  {
    name: 'Toolbelt',
    mapsTo: ['BottomToolbelt'],
    purpose: 'Docked tools launcher with optional expandable panel.',
  },
  {
    name: 'ScriptCanvas',
    mapsTo: ['ScriptDisplay'],
    purpose: 'Paper-style screenplay viewport with optional editing chrome.',
  },
  {
    name: 'ToggleRow',
    mapsTo: ['PlaybackPanel toggles'],
    purpose: 'Reusable icon + label + switch pattern.',
  },
  {
    name: 'RangeControl',
    mapsTo: ['PlaybackPanel', 'VoiceManager'],
    purpose: 'Slider + label/value control for numeric settings.',
  },
];

const tokenProposal = {
  spacing: ['2px', '4px', '6px', '8px', '10px', '12px', '16px', '20px', '24px', '32px'],
  radius: ['6px', '8px', '12px', '16px', '24px'],
  typography: {
    fonts: ['Inter (UI)', 'Courier Prime (screenplay body)'],
    sizes: ['10px', '11px', '12px', '14px', '16px', '20px', '24px'],
    letterSpacing: ['tracking-widest', 'tracking-[0.24em]', 'tracking-[0.32em]'],
  },
  colors: {
    neutral: ['gray-950', 'gray-900', 'gray-800', 'gray-700', 'gray-500', 'gray-300', 'white'],
    brand: ['indigo-600', 'indigo-500', 'indigo-400'],
    semantic: ['red-500', 'amber-300', 'emerald-500'],
    canvas: ['#f6f1e7', '#d6cdbd'],
  },
};

const highestLeverage = [
  {
    component: 'Modal',
    why: 'Four separate modal implementations repeat the same overlay, surface, and action-row structures.',
    refs: ['components/LoginModal.tsx:30', 'components/PrivacyModal.tsx:12', 'components/TitleEditModal.tsx:36', 'components/VoiceCastingModal.tsx:195'],
  },
  {
    component: 'SurfaceCard',
    why: 'Card-like panel styles recur across toolbelt, setup blocks, playback controls, and form sections with minor drift.',
    refs: ['components/BottomToolbelt.tsx:143', 'components/SetupForm.tsx:184', 'components/PlaybackPanel.tsx:136', 'components/VoiceManager.tsx:86'],
  },
  {
    component: 'InputField',
    why: 'Input/select/textarea controls have repeated dark-field + ring styles that diverge slightly by file.',
    refs: ['components/InsertBlock.tsx:120', 'components/LoginModal.tsx:63', 'components/TitleEditModal.tsx:54', 'components/SetupForm.tsx:276'],
  },
];

const componentCountsByCategory = components.reduce((acc, component) => {
  acc[component.category] = (acc[component.category] || 0) + 1;
  return acc;
}, {});

const unusedComponents = components
  .filter((component) => component.appearsUnused)
  .map((component) => `${component.name} (${component.filePath}:${component.line})`);

const escapeTableCell = (value) => String(value)
  .replace(/\|/g, '\\|')
  .replace(/\n/g, ' ')
  .replace(/\r/g, '');

const componentRows = components.map((component) => {
  const propsSummary = component.props.length > 0
    ? component.props.map((prop) => `${prop.name}${prop.optional ? '?' : ''}: ${prop.type}`).join(', ')
    : '(none)';
  const usedBy = component.usedBy.length > 0 ? component.usedBy.join(', ') : '(none)';
  return `| ${escapeTableCell(component.name)} | ${escapeTableCell(`${component.filePath}:${component.line}`)} | ${escapeTableCell(component.category)} | ${escapeTableCell(propsSummary)} | ${escapeTableCell(usedBy)} | ${component.appearsUnused ? 'Yes' : 'No'} |`;
}).join('\n');

const stylePatternRows = topConsolidationPatterns.map((pattern) => {
  const sampleRef = pattern.occurrences[0]?.filePath || 'n/a';
  return `| ${escapeTableCell(pattern.name)} | ${pattern.count} | ${escapeTableCell(sampleRef)} | ${escapeTableCell(pattern.description)} |`;
}).join('\n');

const screenRows = screens.map((screen) => {
  const regions = screen.regions.map((region) => `- ${region.name}: ${region.description} (${region.fileRef})`).join('<br/>');
  return `| ${escapeTableCell(screen.route)} | ${escapeTableCell(screen.topLevelComponent)} | ${escapeTableCell(regions)} |`;
}).join('\n');

const markdown = `# UI Inventory Report - Script Seance

Generated: ${new Date().toISOString()}

## 1) Routing / Screen Map

- Routing system: **${routingSystem.type}** (${routingSystem.library})
- Evidence: ` + '`App.tsx:408`, `App.tsx:431`, `index.tsx:14`' + `
- Notes: ${routingSystem.notes}

| Route | Top-level component | Layout regions |
| --- | --- | --- |
${screenRows}

## 2) Component Inventory

- Total TSX components found: **${components.length}**
- Categories: pages/screens=${componentCountsByCategory['pages/screens'] || 0}, layout=${componentCountsByCategory.layout || 0}, primitives=${componentCountsByCategory.primitives || 0}, composed widgets=${componentCountsByCategory['composed widgets'] || 0}

| Component | Path | Category | Props (name: type) | Used-by imports | Appears unused |
| --- | --- | --- | --- | --- | --- |
${componentRows}

Unused flags (heuristic): ${unusedComponents.length > 0 ? unusedComponents.join('; ') : 'None detected.'}

## 3) Style System Audit

- Styling approach:
- Tailwind utilities in JSX (` + '`tailwind.config.js:1`, `index.css:1`' + `)
- Global CSS for base + scrollbar (` + '`index.css:5`' + `)
- Additional inline style blocks for export/animation (` + '`components/ScriptDisplay.tsx:38`, `components/VoiceCastingModal.tsx:390`' + `)

- Theme/token sources:
- ` + '`tailwind.config.js`' + ` (font extension)
- ` + '`index.css`' + ` (base colors/fonts)
- ` + '`index.html`' + ` (font loading)
- ` + '`components/ScriptDisplay.tsx`' + ` (print/export paper styles)

Top repeated values (selected):
- Spacing tokens: ${topTokens(spacingCount, 8).map((item) => `${item.token} (${item.count})`).join(', ')}
- Radius tokens: ${topTokens(radiusCount, 6).map((item) => `${item.token} (${item.count})`).join(', ')}
- Shadow tokens: ${topTokens(shadowCount, 6).map((item) => `${item.token} (${item.count})`).join(', ')}

Top 10 style patterns worth consolidating:

| Pattern | Occurrences | Example ref | Why consolidate |
| --- | --- | --- | --- |
${stylePatternRows}

## 4) Recommendations (No Code Changes)

Minimal Design System v1 component list (based on current UI):
${recommendationComponents.map((item) => `- **${item.name}**: ${item.purpose} (maps to ${item.mapsTo.join(', ')})`).join('\n')}

Minimal token set proposal inferred from usage:
- Spacing scale: ${tokenProposal.spacing.join(', ')}
- Radius scale: ${tokenProposal.radius.join(', ')}
- Typography: fonts=${tokenProposal.typography.fonts.join(', ')}; sizes=${tokenProposal.typography.sizes.join(', ')}; letter-spacing=${tokenProposal.typography.letterSpacing.join(', ')}
- Color tokens: neutral=${tokenProposal.colors.neutral.join(', ')}; brand=${tokenProposal.colors.brand.join(', ')}; semantic=${tokenProposal.colors.semantic.join(', ')}; canvas=${tokenProposal.colors.canvas.join(', ')}

3 highest-leverage components to standardize first:
${highestLeverage.map((item, idx) => `${idx + 1}. **${item.component}** - ${item.why} Refs: ${item.refs.join(', ')}`).join('\n')}

## 5) Penpot Import Pack

Generated pack:
- SVGs: ` + '`docs/ui-inventory/penpot-pack/*.svg`' + `
- Manifest: ` + '`docs/ui-inventory/penpot-pack/manifest.json`' + `
- Zip: ` + '`docs/ui-inventory/penpot-pack.zip`' + `

Manifest fields included per pattern:
- ` + '`componentName`' + `
- ` + '`defaultBoundingBox`' + `
- ` + '`visualVariationProps`' + `
- ` + '`sourceFilePath`' + `
`;

const penpotSpecs = [
  {
    componentName: 'AppShell',
    width: 1280,
    height: 720,
    visualVariationProps: 'hasContext (boolean), hasToast (boolean), hasModal (enum)',
    sourceFilePath: 'App.tsx',
    draw: ({ width, height }) => `
  <rect x="0" y="0" width="${width}" height="${height}" fill="#111827"/>
  <rect x="48" y="32" width="1184" height="72" rx="12" fill="#1f2937" stroke="#374151"/>
  <rect x="48" y="120" width="1184" height="500" rx="12" fill="#0b1220" stroke="#374151"/>
  <rect x="48" y="640" width="1184" height="48" rx="12" fill="#111827" stroke="#374151"/>
  <text x="72" y="76" font-size="20" fill="#f9fafb" font-family="Inter, sans-serif">AppShell</text>
`,
  },
  {
    componentName: 'TopHeaderBar',
    width: 1200,
    height: 92,
    visualVariationProps: 'hasAutosaveError (boolean), canUndo/canRedo (boolean)',
    sourceFilePath: 'components/ScriptPane.tsx',
    draw: ({ width, height }) => `
  <rect x="0" y="0" width="${width}" height="${height}" rx="12" fill="#111827" stroke="#374151"/>
  <text x="24" y="34" font-size="22" fill="#f9fafb" font-family="Inter, sans-serif">SCRIPT SEANCE</text>
  <rect x="930" y="20" width="78" height="28" rx="6" fill="#1f2937" stroke="#4b5563"/>
  <rect x="1018" y="20" width="78" height="28" rx="6" fill="#1f2937" stroke="#4b5563"/>
  <rect x="1106" y="20" width="86" height="28" rx="6" fill="#7f1d1d" stroke="#ef4444"/>
  <text x="952" y="39" font-size="10" fill="#d1d5db" font-family="Inter, sans-serif">Undo</text>
  <text x="1040" y="39" font-size="10" fill="#d1d5db" font-family="Inter, sans-serif">Redo</text>
  <text x="1121" y="39" font-size="10" fill="#fecaca" font-family="Inter, sans-serif">Clear</text>
`,
  },
  {
    componentName: 'ButtonPrimary',
    width: 180,
    height: 44,
    visualVariationProps: 'size (sm|md|lg), loading (boolean), disabled (boolean)',
    sourceFilePath: 'components/Button.tsx',
    draw: () => `
  <rect x="0.5" y="0.5" width="179" height="43" rx="8" fill="#4f46e5" stroke="#6366f1"/>
  <text x="90" y="27" text-anchor="middle" font-size="14" fill="#ffffff" font-family="Inter, sans-serif">Primary Button</text>
`,
  },
  {
    componentName: 'ButtonSecondary',
    width: 180,
    height: 44,
    visualVariationProps: 'size (sm|md|lg), disabled (boolean)',
    sourceFilePath: 'components/Button.tsx',
    draw: () => `
  <rect x="0.5" y="0.5" width="179" height="43" rx="8" fill="#374151" stroke="#4b5563"/>
  <text x="90" y="27" text-anchor="middle" font-size="14" fill="#e5e7eb" font-family="Inter, sans-serif">Secondary</text>
`,
  },
  {
    componentName: 'CardBase',
    width: 360,
    height: 220,
    visualVariationProps: 'tone (default|indigo|danger), elevation (low|high)',
    sourceFilePath: 'components/BottomToolbelt.tsx',
    draw: () => `
  <rect x="0" y="0" width="360" height="220" rx="16" fill="#111827" stroke="#374151"/>
  <rect x="1" y="1" width="358" height="46" rx="16" fill="#0b1220" stroke="#374151"/>
  <text x="20" y="30" font-size="11" fill="#9ca3af" font-family="Inter, sans-serif" letter-spacing="2">CARD HEADER</text>
  <text x="20" y="80" font-size="14" fill="#d1d5db" font-family="Inter, sans-serif">Card body content</text>
`,
  },
  {
    componentName: 'ModalBase',
    width: 560,
    height: 360,
    visualVariationProps: 'size (sm|md|lg), dismissable (boolean), hasFooterActions (boolean)',
    sourceFilePath: 'components/LoginModal.tsx',
    draw: () => `
  <rect x="0" y="0" width="560" height="360" fill="#000000" fill-opacity="0.55"/>
  <rect x="120" y="56" width="320" height="248" rx="16" fill="#111827" stroke="#374151"/>
  <text x="150" y="96" font-size="18" fill="#ffffff" font-family="Inter, sans-serif">Modal Title</text>
  <rect x="150" y="120" width="260" height="38" rx="8" fill="#030712" stroke="#4b5563"/>
  <rect x="150" y="172" width="260" height="36" rx="8" fill="#4f46e5" stroke="#6366f1"/>
  <text x="280" y="194" text-anchor="middle" font-size="13" fill="#ffffff" font-family="Inter, sans-serif">Primary Action</text>
`,
  },
  {
    componentName: 'InputField',
    width: 320,
    height: 44,
    visualVariationProps: 'state (default|focus|error|disabled), kind (input|textarea|select)',
    sourceFilePath: 'components/InsertBlock.tsx',
    draw: () => `
  <rect x="0.5" y="0.5" width="319" height="43" rx="8" fill="#030712" stroke="#4b5563"/>
  <text x="14" y="27" font-size="13" fill="#9ca3af" font-family="Inter, sans-serif">Input value</text>
`,
  },
  {
    componentName: 'ToolbeltButton',
    width: 148,
    height: 52,
    visualVariationProps: 'active (boolean), icon (enum), label (string)',
    sourceFilePath: 'components/BottomToolbelt.tsx',
    draw: () => `
  <rect x="0.5" y="0.5" width="147" height="51" rx="14" fill="#111827" stroke="#374151"/>
  <circle cx="28" cy="26" r="8" fill="#6b7280"/>
  <text x="44" y="30" font-size="11" fill="#d1d5db" font-family="Inter, sans-serif">TOOL</text>
`,
  },
  {
    componentName: 'ScriptPaperPane',
    width: 900,
    height: 560,
    visualVariationProps: 'scrollable (boolean), highlightActiveBlock (boolean), insertMode (boolean)',
    sourceFilePath: 'components/ScriptDisplay.tsx',
    draw: () => `
  <rect x="0" y="0" width="900" height="560" rx="10" fill="#f6f1e7" stroke="#d6cdbd"/>
  <rect x="44" y="56" width="812" height="2" fill="#d1d5db"/>
  <text x="44" y="42" font-size="20" fill="#111111" font-family="Courier Prime, monospace">INT. STUDIO - NIGHT</text>
  <text x="44" y="104" font-size="16" fill="#111111" font-family="Courier Prime, monospace">A strange glow fills the control room.</text>
  <text x="450" y="184" text-anchor="middle" font-size="16" fill="#111111" font-family="Courier Prime, monospace">NARRATOR</text>
  <text x="450" y="214" text-anchor="middle" font-size="16" fill="#111111" font-family="Courier Prime, monospace">The signal is almost clear.</text>
`,
  },
  {
    componentName: 'ToggleSwitch',
    width: 180,
    height: 28,
    visualVariationProps: 'enabled (boolean), label (string), icon (enum)',
    sourceFilePath: 'components/PlaybackPanel.tsx',
    draw: () => `
  <text x="2" y="18" font-size="11" fill="#d1d5db" font-family="Inter, sans-serif">AUTO-SCROLL</text>
  <rect x="110" y="6" width="56" height="16" rx="8" fill="#4f46e5"/>
  <circle cx="154" cy="14" r="7" fill="#ffffff"/>
`,
  },
  {
    componentName: 'RangeSlider',
    width: 260,
    height: 28,
    visualVariationProps: 'min/max/step values, currentValue, accentColor',
    sourceFilePath: 'components/PlaybackPanel.tsx',
    draw: () => `
  <text x="0" y="12" font-size="10" fill="#9ca3af" font-family="Inter, sans-serif">SPEED</text>
  <text x="36" y="12" font-size="11" fill="#a5b4fc" font-family="Inter, sans-serif">1.0x</text>
  <rect x="68" y="8" width="184" height="4" rx="2" fill="#374151"/>
  <circle cx="146" cy="10" r="6" fill="#6366f1" stroke="#a5b4fc"/>
`,
  },
];

fs.mkdirSync(inventoryDir, { recursive: true });
fs.mkdirSync(penpotDir, { recursive: true });

for (const spec of penpotSpecs) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${spec.width}" height="${spec.height}" viewBox="0 0 ${spec.width} ${spec.height}" fill="none">${spec.draw(spec)}\n</svg>\n`;
  fs.writeFileSync(path.join(penpotDir, `${spec.componentName}.svg`), svg, 'utf8');
}

const penpotManifest = {
  generatedAt: new Date().toISOString(),
  components: penpotSpecs.map((spec) => ({
    componentName: spec.componentName,
    defaultBoundingBox: { width: spec.width, height: spec.height },
    visualVariationProps: spec.visualVariationProps,
    sourceFilePath: spec.sourceFilePath,
  })),
};

fs.writeFileSync(path.join(penpotDir, 'manifest.json'), JSON.stringify(penpotManifest, null, 2));
fs.writeFileSync(path.join(inventoryDir, 'screens.json'), JSON.stringify(screensJson, null, 2));
fs.writeFileSync(path.join(inventoryDir, 'components.json'), JSON.stringify(componentsJson, null, 2));
fs.writeFileSync(path.join(inventoryDir, 'styles.json'), JSON.stringify(stylesJson, null, 2));
fs.writeFileSync(path.join(docsDir, 'ui-inventory.md'), markdown, 'utf8');

try {
  execSync(`cd ${JSON.stringify(inventoryDir)} && rm -f penpot-pack.zip && zip -r penpot-pack.zip penpot-pack`, {
    stdio: 'ignore',
  });
} catch {
  // zip utility may not be available; report remains in console output.
}

console.log('UI inventory artifacts generated.');
console.log(`- ${rel(path.join(docsDir, 'ui-inventory.md'))}`);
console.log(`- ${rel(path.join(inventoryDir, 'screens.json'))}`);
console.log(`- ${rel(path.join(inventoryDir, 'components.json'))}`);
console.log(`- ${rel(path.join(inventoryDir, 'styles.json'))}`);
console.log(`- ${rel(path.join(penpotDir, 'manifest.json'))}`);
