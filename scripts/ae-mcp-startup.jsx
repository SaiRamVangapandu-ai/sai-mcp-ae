// SAI MCP AE — Silent Background Bridge
// Place in: AE Scripts/Startup/ folder
// Polls ~/Documents/ae-mcp-bridge/command.json silently, no window.

(function () {
  var SAI_BRIDGE_DIR  = Folder.myDocuments.fsName + "/ae-mcp-bridge";
  var SAI_CMD_FILE    = SAI_BRIDGE_DIR + "/command.json";
  var SAI_RESULT_FILE = SAI_BRIDGE_DIR + "/result.json";
  var SAI_POLL_MS     = 1500;
  var saiLastCmdId    = "";

  function ensureDir() {
    var d = new Folder(SAI_BRIDGE_DIR);
    if (!d.exists) d.create();
  }

  function readJSON(fp) {
    var f = new File(fp);
    if (!f.exists) return null;
    f.encoding = "UTF-8"; f.open("r");
    var raw = f.read(); f.close();
    try { return JSON.parse(raw); } catch(e) { return null; }
  }

  function writeJSON(fp, obj) {
    ensureDir();
    var f = new File(fp);
    f.encoding = "UTF-8"; f.open("w");
    f.write(JSON.stringify(obj, null, 2)); f.close();
  }

  function findComp(name) {
    for (var i = 1; i <= app.project.items.length; i++) {
      var it = app.project.items[i];
      if (it instanceof CompItem && it.name === name) return it;
    }
    return null;
  }

  function findLayer(comp, name) {
    for (var j = 1; j <= comp.layers.length; j++) {
      if (comp.layers[j].name === name) return comp.layers[j];
    }
    return null;
  }

  function saiDispatch(cmd, args) {
    if (cmd === "listComps") {
      var list = [];
      for (var i = 1; i <= app.project.items.length; i++) {
        var it = app.project.items[i];
        if (it instanceof CompItem)
          list.push({ name: it.name, width: it.width, height: it.height, duration: it.duration, frameRate: it.frameRate });
      }
      return { success: true, comps: list };
    }
    if (cmd === "createComp") {
      app.beginUndoGroup("SAI MCP: createComp");
      try {
        var ex = findComp(args.name);
        if (ex) { app.endUndoGroup(); return { success: true, note: "exists", name: ex.name }; }
        var bg = args.bgColor || [0,0,0];
        var comp = app.project.items.addComp(args.name, args.width, args.height, 1.0, args.duration, args.frameRate);
        comp.bgColor = [bg[0], bg[1], bg[2]];
        app.endUndoGroup();
        return { success: true, name: comp.name, width: comp.width, height: comp.height };
      } catch(e) { try{app.endUndoGroup();}catch(ex){} return { success: false, error: e.toString() }; }
    }
    if (cmd === "addLayer") {
      app.beginUndoGroup("SAI MCP: addLayer");
      try {
        var comp = findComp(args.compName);
        if (!comp) { app.endUndoGroup(); return { success: false, error: "Comp not found: " + args.compName }; }
        var layer;
        if (args.layerType === "solid") {
          var c = args.color || [0.5,0.5,0.5];
          layer = comp.layers.addSolid([c[0],c[1],c[2]], args.name||"Solid", args.width||comp.width, args.height||comp.height, 1.0);
        } else if (args.layerType === "text") {
          layer = comp.layers.addText(args.text || "");
          layer.name = args.name || "Text Layer";
          var td = layer.property("Source Text").value;
          td.fontSize = args.fontSize || 72;
          td.fillColor = [1,1,1]; td.applyFill = true;
          layer.property("Source Text").setValue(td);
        } else if (args.layerType === "null") {
          layer = comp.layers.addNull(comp.duration);
          layer.name = args.name || "Null";
        } else if (args.layerType === "shape") {
          layer = comp.layers.addShape();
          layer.name = args.name || "Shape Layer";
        } else {
          app.endUndoGroup();
          return { success: false, error: "Unknown layerType: " + args.layerType };
        }
        if (args.name && args.layerType !== "text") layer.name = args.name;
        app.endUndoGroup();
        return { success: true, layerName: layer.name, layerIndex: layer.index };
      } catch(e) { try{app.endUndoGroup();}catch(ex){} return { success: false, error: e.toString() }; }
    }
    if (cmd === "setKeyframe") {
      app.beginUndoGroup("SAI MCP: setKeyframe");
      try {
        var comp = findComp(args.compName); if (!comp) { app.endUndoGroup(); return { success: false, error: "Comp not found" }; }
        var layer = findLayer(comp, args.layerName); if (!layer) { app.endUndoGroup(); return { success: false, error: "Layer not found" }; }
        var prop = layer.property("Transform").property(args.property); if (!prop) { app.endUndoGroup(); return { success: false, error: "Prop not found" }; }
        prop.setValueAtTime(args.time, args.value);
        app.endUndoGroup(); return { success: true };
      } catch(e) { try{app.endUndoGroup();}catch(ex){} return { success: false, error: e.toString() }; }
    }
    if (cmd === "setExpression") {
      app.beginUndoGroup("SAI MCP: setExpression");
      try {
        var comp = findComp(args.compName); if (!comp) { app.endUndoGroup(); return { success: false, error: "Comp not found" }; }
        var layer = findLayer(comp, args.layerName); if (!layer) { app.endUndoGroup(); return { success: false, error: "Layer not found" }; }
        var prop = layer.property("Transform").property(args.property); if (!prop) { app.endUndoGroup(); return { success: false, error: "Prop not found" }; }
        prop.expression = args.expression;
        app.endUndoGroup(); return { success: true };
      } catch(e) { try{app.endUndoGroup();}catch(ex){} return { success: false, error: e.toString() }; }
    }
    if (cmd === "applyEffect") {
      app.beginUndoGroup("SAI MCP: applyEffect");
      try {
        var comp = findComp(args.compName); if (!comp) { app.endUndoGroup(); return { success: false, error: "Comp not found" }; }
        var layer = findLayer(comp, args.layerName); if (!layer) { app.endUndoGroup(); return { success: false, error: "Layer not found" }; }
        var effect = layer.Effects.addProperty(args.effectMatchName);
        if (!effect) { app.endUndoGroup(); return { success: false, error: "Effect not found: " + args.effectMatchName }; }
        if (args.properties) { for (var k in args.properties) { try { var p = effect.property(k); if (p && p.canSetValue) p.setValue(args.properties[k]); } catch(pe){} } }
        app.endUndoGroup(); return { success: true, effectName: effect.name };
      } catch(e) { try{app.endUndoGroup();}catch(ex){} return { success: false, error: e.toString() }; }
    }
    if (cmd === "trimLayer") {
      app.beginUndoGroup("SAI MCP: trimLayer");
      try {
        var comp = findComp(args.compName); if (!comp) { app.endUndoGroup(); return { success: false, error: "Comp not found" }; }
        var layer = findLayer(comp, args.layerName); if (!layer) { app.endUndoGroup(); return { success: false, error: "Layer not found" }; }
        if (typeof args.inPoint === "number") layer.inPoint = args.inPoint;
        if (typeof args.outPoint === "number") layer.outPoint = args.outPoint;
        app.endUndoGroup(); return { success: true, inPoint: layer.inPoint, outPoint: layer.outPoint };
      } catch(e) { try{app.endUndoGroup();}catch(ex){} return { success: false, error: e.toString() }; }
    }
    if (cmd === "getLayerInfo") {
      var comp = findComp(args.compName); if (!comp) return { success: false, error: "Comp not found" };
      var layers = [];
      for (var j = 1; j <= comp.layers.length; j++) {
        var l = comp.layers[j];
        layers.push({ index: l.index, name: l.name, inPoint: l.inPoint, outPoint: l.outPoint });
      }
      return { success: true, layers: layers };
    }
    if (cmd === "runScript") {
      try { return { success: true, result: eval(args.code) }; }
      catch(e) { return { success: false, error: e.toString() }; }
    }
    return { success: false, error: "Unknown command: " + cmd };
  }

  // Global poll — called by scheduleTask
  $.global.saiMCPPoll = function () {
    try {
      var cmd = readJSON(SAI_CMD_FILE);
      if (cmd && cmd.status === "pending" && cmd.id !== saiLastCmdId) {
        saiLastCmdId = cmd.id;
        var result = saiDispatch(cmd.command, cmd.args || {});
        result.id = cmd.id; result._command = cmd.command;
        writeJSON(SAI_RESULT_FILE, result);
        cmd.status = "done"; writeJSON(SAI_CMD_FILE, cmd);
      }
    } catch(e) { /* silent */ }
  };

  ensureDir();
  app.scheduleTask("$.global.saiMCPPoll()", SAI_POLL_MS, true);

}());
