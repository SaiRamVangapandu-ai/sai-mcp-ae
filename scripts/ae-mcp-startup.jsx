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

    if (cmd === "applyKeying") {
      app.beginUndoGroup("SAI MCP: applyKeying");
      try {
        var comp = findComp(args.compName); if (!comp) { app.endUndoGroup(); return { success: false, error: "Comp not found" }; }
        var layer = findLayer(comp, args.layerName); if (!layer) { app.endUndoGroup(); return { success: false, error: "Layer not found" }; }
        var kl = layer.Effects.addProperty("ADBE Keylight");
        if (!kl) { app.endUndoGroup(); return { success: false, error: "Keylight not available" }; }
        var sc = args.screenColor || [0, 1, 0];
        kl.property("ADBE Keylight-0001").setValue([sc[0], sc[1], sc[2]]);
        if (args.screenGain !== undefined) kl.property("ADBE Keylight-0003").setValue(args.screenGain);
        if (args.screenBalance !== undefined) kl.property("ADBE Keylight-0004").setValue(args.screenBalance);
        app.endUndoGroup();
        return { success: true, effect: "Keylight", screenColor: sc };
      } catch(e) { try{app.endUndoGroup();}catch(ex){} return { success: false, error: e.toString() }; }
    }

    if (cmd === "stabilize") {
      app.beginUndoGroup("SAI MCP: stabilize");
      try {
        var comp = findComp(args.compName); if (!comp) { app.endUndoGroup(); return { success: false, error: "Comp not found" }; }
        var layer = findLayer(comp, args.layerName); if (!layer) { app.endUndoGroup(); return { success: false, error: "Layer not found" }; }
        var ws = layer.Effects.addProperty("ADBE Warp Stabilizer");
        if (!ws) { app.endUndoGroup(); return { success: false, error: "Warp Stabilizer not available" }; }
        if (args.smoothness !== undefined) ws.property("ADBE WS Smoothness").setValue(args.smoothness);
        var methodMap = { subspace_warp: 3, perspective: 2, similarity: 1, position: 0 };
        if (args.method && methodMap[args.method] !== undefined) ws.property("ADBE WS Method").setValue(methodMap[args.method]);
        app.endUndoGroup();
        return { success: true, effect: "Warp Stabilizer" };
      } catch(e) { try{app.endUndoGroup();}catch(ex){} return { success: false, error: e.toString() }; }
    }

    if (cmd === "addCamera") {
      app.beginUndoGroup("SAI MCP: addCamera");
      try {
        var comp = findComp(args.compName); if (!comp) { app.endUndoGroup(); return { success: false, error: "Comp not found" }; }
        var camType = (args.cameraType === "one_node") ? CameraType.ONE_NODE : CameraType.TWO_NODE;
        var fov = args.focalLength || 50;
        var cam = comp.layers.addCamera(args.name || "Camera 1", [comp.width / 2, comp.height / 2]);
        cam.cameraOption.property("ADBE Camera Options Group").property("ADBE Camera Zoom").setValue(fov * 10);
        app.endUndoGroup();
        return { success: true, cameraName: cam.name };
      } catch(e) { try{app.endUndoGroup();}catch(ex){} return { success: false, error: e.toString() }; }
    }

    if (cmd === "set3D") {
      app.beginUndoGroup("SAI MCP: set3D");
      try {
        var comp = findComp(args.compName); if (!comp) { app.endUndoGroup(); return { success: false, error: "Comp not found" }; }
        var layer = findLayer(comp, args.layerName); if (!layer) { app.endUndoGroup(); return { success: false, error: "Layer not found" }; }
        layer.threeDLayer = !!args.enabled;
        app.endUndoGroup();
        return { success: true, layerName: layer.name, threeDLayer: layer.threeDLayer };
      } catch(e) { try{app.endUndoGroup();}catch(ex){} return { success: false, error: e.toString() }; }
    }

    if (cmd === "duplicateLayer") {
      app.beginUndoGroup("SAI MCP: duplicateLayer");
      try {
        var comp = findComp(args.compName); if (!comp) { app.endUndoGroup(); return { success: false, error: "Comp not found" }; }
        var layer = findLayer(comp, args.layerName); if (!layer) { app.endUndoGroup(); return { success: false, error: "Layer not found" }; }
        var dup = layer.duplicate();
        if (args.newName) dup.name = args.newName;
        app.endUndoGroup();
        return { success: true, newLayerName: dup.name, layerIndex: dup.index };
      } catch(e) { try{app.endUndoGroup();}catch(ex){} return { success: false, error: e.toString() }; }
    }

    if (cmd === "parentLayer") {
      app.beginUndoGroup("SAI MCP: parentLayer");
      try {
        var comp = findComp(args.compName); if (!comp) { app.endUndoGroup(); return { success: false, error: "Comp not found" }; }
        var layer = findLayer(comp, args.layerName); if (!layer) { app.endUndoGroup(); return { success: false, error: "Child layer not found" }; }
        if (!args.parentName || args.parentName === "") {
          layer.parent = null;
        } else {
          var parent = findLayer(comp, args.parentName); if (!parent) { app.endUndoGroup(); return { success: false, error: "Parent layer not found" }; }
          layer.parent = parent;
        }
        app.endUndoGroup();
        return { success: true, layer: layer.name, parent: args.parentName || "none" };
      } catch(e) { try{app.endUndoGroup();}catch(ex){} return { success: false, error: e.toString() }; }
    }

    if (cmd === "addMask") {
      app.beginUndoGroup("SAI MCP: addMask");
      try {
        var comp = findComp(args.compName); if (!comp) { app.endUndoGroup(); return { success: false, error: "Comp not found" }; }
        var layer = findLayer(comp, args.layerName); if (!layer) { app.endUndoGroup(); return { success: false, error: "Layer not found" }; }
        var masks = layer.property("ADBE Mask Parade");
        var mask = masks.addProperty("ADBE Mask Atom");
        var cx = args.position ? args.position[0] : comp.width / 2;
        var cy = args.position ? args.position[1] : comp.height / 2;
        var hw = args.size ? args.size[0] / 2 : comp.width / 4;
        var hh = args.size ? args.size[1] / 2 : comp.height / 4;
        var shape = new Shape(); shape.closed = true;
        if (args.shape === "ellipse") {
          var k = 0.5523;
          shape.vertices = [[cx, cy-hh],[cx+hw, cy],[cx, cy+hh],[cx-hw, cy]];
          shape.inTangents = [[-hw*k,0],[0,-hh*k],[hw*k,0],[0,hh*k]];
          shape.outTangents = [[hw*k,0],[0,hh*k],[-hw*k,0],[0,-hh*k]];
        } else {
          shape.vertices = [[cx-hw,cy-hh],[cx+hw,cy-hh],[cx+hw,cy+hh],[cx-hw,cy+hh]];
          shape.inTangents = [[0,0],[0,0],[0,0],[0,0]];
          shape.outTangents = [[0,0],[0,0],[0,0],[0,0]];
        }
        mask.property("ADBE Mask Shape").setValue(shape);
        if (args.feather) mask.property("ADBE Mask Feather").setValue([args.feather, args.feather]);
        if (args.inverted) mask.inverted = true;
        app.endUndoGroup();
        return { success: true, maskIndex: masks.numProperties };
      } catch(e) { try{app.endUndoGroup();}catch(ex){} return { success: false, error: e.toString() }; }
    }

    if (cmd === "preCompose") {
      app.beginUndoGroup("SAI MCP: preCompose");
      try {
        var comp = findComp(args.compName); if (!comp) { app.endUndoGroup(); return { success: false, error: "Comp not found" }; }
        var layer = findLayer(comp, args.layerName); if (!layer) { app.endUndoGroup(); return { success: false, error: "Layer not found" }; }
        comp.layers.precompose([layer.index], args.newCompName, args.moveAll !== false);
        app.endUndoGroup();
        return { success: true, newCompName: args.newCompName };
      } catch(e) { try{app.endUndoGroup();}catch(ex){} return { success: false, error: e.toString() }; }
    }

    if (cmd === "trackCamera") {
      app.beginUndoGroup("SAI MCP: trackCamera");
      try {
        var comp = findComp(args.compName); if (!comp) { app.endUndoGroup(); return { success: false, error: "Comp not found" }; }
        var layer = findLayer(comp, args.layerName); if (!layer) { app.endUndoGroup(); return { success: false, error: "Layer not found" }; }
        var tracker = layer.Effects.addProperty("ADBE 3D Camera Tracker");
        if (!tracker) { app.endUndoGroup(); return { success: false, error: "3D Camera Tracker not available" }; }
        app.endUndoGroup();
        return { success: true, note: "3D Camera Tracker applied. Open AE to run the analysis." };
      } catch(e) { try{app.endUndoGroup();}catch(ex){} return { success: false, error: e.toString() }; }
    }

    // ── Color Grade ────────────────────────────────────────────────────────────
    if (cmd === "colorGrade") {
      app.beginUndoGroup("SAI MCP: colorGrade");
      try {
        var comp = findComp(args.compName); if (!comp) { app.endUndoGroup(); return { success: false, error: "Comp not found" }; }
        var layer = findLayer(comp, args.layerName); if (!layer) { app.endUndoGroup(); return { success: false, error: "Layer not found" }; }
        var intensity = (args.intensity !== undefined ? args.intensity : 100) / 100;
        var p = args.preset;

        // Always add Brightness & Contrast
        var bc = layer.Effects.addProperty("ADBE Brightness & Contrast 2");
        // Always add Hue/Saturation
        var hs = layer.Effects.addProperty("ADBE HUE SATURATION");
        // Always add Curves
        var cv = layer.Effects.addProperty("ADBE CurvesCustom");

        if (p === "cinematic") {
          bc.property("ADBE Brightness & Contrast 2-0002").setValue(15 * intensity);
          hs.property("ADBE HUE SATURATION-0003").setValue(-20 * intensity);
          // Blue channel lift for teal-orange look
        } else if (p === "warm") {
          bc.property("ADBE Brightness & Contrast 2-0001").setValue(5 * intensity);
          bc.property("ADBE Brightness & Contrast 2-0002").setValue(10 * intensity);
          hs.property("ADBE HUE SATURATION-0003").setValue(20 * intensity);
          hs.property("ADBE HUE SATURATION-0002").setValue(15 * intensity);
        } else if (p === "cool") {
          hs.property("ADBE HUE SATURATION-0003").setValue(-10 * intensity);
          hs.property("ADBE HUE SATURATION-0002").setValue(-20 * intensity);
        } else if (p === "vintage") {
          bc.property("ADBE Brightness & Contrast 2-0002").setValue(10 * intensity);
          hs.property("ADBE HUE SATURATION-0003").setValue(-40 * intensity);
          hs.property("ADBE HUE SATURATION-0002").setValue(10 * intensity);
        } else if (p === "moody") {
          bc.property("ADBE Brightness & Contrast 2-0001").setValue(-10 * intensity);
          bc.property("ADBE Brightness & Contrast 2-0002").setValue(20 * intensity);
          hs.property("ADBE HUE SATURATION-0003").setValue(-30 * intensity);
        } else if (p === "bright") {
          bc.property("ADBE Brightness & Contrast 2-0001").setValue(15 * intensity);
          bc.property("ADBE Brightness & Contrast 2-0002").setValue(5 * intensity);
          hs.property("ADBE HUE SATURATION-0003").setValue(15 * intensity);
        } else if (p === "clean") {
          bc.property("ADBE Brightness & Contrast 2-0002").setValue(8 * intensity);
        }

        app.endUndoGroup();
        return { success: true, preset: p, intensity: args.intensity || 100 };
      } catch(e) { try{app.endUndoGroup();}catch(ex){} return { success: false, error: e.toString() }; }
    }

    // ── Adjust Color ───────────────────────────────────────────────────────────
    if (cmd === "adjustColor") {
      app.beginUndoGroup("SAI MCP: adjustColor");
      try {
        var comp = findComp(args.compName); if (!comp) { app.endUndoGroup(); return { success: false, error: "Comp not found" }; }
        var layer = findLayer(comp, args.layerName); if (!layer) { app.endUndoGroup(); return { success: false, error: "Layer not found" }; }

        if (args.brightness !== undefined || args.contrast !== undefined) {
          var bc = layer.Effects.addProperty("ADBE Brightness & Contrast 2");
          if (args.brightness !== undefined) bc.property("ADBE Brightness & Contrast 2-0001").setValue(args.brightness);
          if (args.contrast !== undefined) bc.property("ADBE Brightness & Contrast 2-0002").setValue(args.contrast);
        }
        if (args.saturation !== undefined || args.hue !== undefined) {
          var hs = layer.Effects.addProperty("ADBE HUE SATURATION");
          if (args.hue !== undefined) hs.property("ADBE HUE SATURATION-0002").setValue(args.hue);
          if (args.saturation !== undefined) hs.property("ADBE HUE SATURATION-0003").setValue(args.saturation);
        }
        if (args.temperature !== undefined) {
          var cb = layer.Effects.addProperty("ADBE Color Balance (HLS)");
          // Warm = shift hue slightly toward orange, boost lightness
          cb.property("ADBE Color Balance (HLS)-0002").setValue(args.temperature * 0.3);
          cb.property("ADBE Color Balance (HLS)-0003").setValue(args.temperature * 0.1);
        }
        if (args.vignette) {
          var vig = layer.Effects.addProperty("ADBE Ramp");
          vig.property(5).setValue(2); // radial
          vig.property(1).setValue([comp.width/2, comp.height/2]);
          vig.property(3).setValue([comp.width * 0.9, comp.height * 0.9]);
          vig.property(2).setValue([0,0,0,0]);
          vig.property(4).setValue([0,0,0,1]);
          layer.Effects.property(layer.Effects.numProperties).blendingMode = BlendingMode.MULTIPLY;
        }

        app.endUndoGroup();
        return { success: true };
      } catch(e) { try{app.endUndoGroup();}catch(ex){} return { success: false, error: e.toString() }; }
    }

    // ── Animate Text ───────────────────────────────────────────────────────────
    if (cmd === "animateText") {
      app.beginUndoGroup("SAI MCP: animateText");
      try {
        var comp = findComp(args.compName); if (!comp) { app.endUndoGroup(); return { success: false, error: "Comp not found" }; }
        var layer = findLayer(comp, args.layerName); if (!layer) { app.endUndoGroup(); return { success: false, error: "Layer not found" }; }

        var startT  = args.startTime  || 0;
        var dur     = args.duration   || 1;
        var endT    = startT + dur;
        var animDir = args.direction  || "in";
        var type    = args.type;

        var textProp = layer.property("ADBE Text Properties");
        var animators = textProp.property("ADBE Text Animators");
        var animator = animators.addProperty("ADBE Text Animator");
        animator.name = type;

        var range = animator.property("ADBE Text Selectors").addProperty("ADBE Text Selector");
        var rangeProp = range.property("ADBE Text Percent Start");

        if (type === "typewriter") {
          // Opacity animator — characters appear one by one
          var opacProp = animator.property("ADBE Text Animator Properties").addProperty("ADBE Text Opacity");
          opacProp.setValue(0);
          range.property("ADBE Text Percent End").setValueAtTime(startT, 0);
          range.property("ADBE Text Percent End").setValueAtTime(endT, 100);
          if (animDir === "out" || animDir === "both") {
            range.property("ADBE Text Percent End").setValueAtTime(endT + dur, 0);
          }
        } else if (type === "fade_in") {
          var opacProp = animator.property("ADBE Text Animator Properties").addProperty("ADBE Text Opacity");
          opacProp.setValue(0);
          range.property("ADBE Text Percent End").setValueAtTime(startT, 0);
          range.property("ADBE Text Percent End").setValueAtTime(endT, 100);
        } else if (type === "fade_up") {
          var opacProp = animator.property("ADBE Text Animator Properties").addProperty("ADBE Text Opacity");
          opacProp.setValue(0);
          var posProp = animator.property("ADBE Text Animator Properties").addProperty("ADBE Text Position");
          posProp.setValue([0, 40]);
          range.property("ADBE Text Percent End").setValueAtTime(startT, 0);
          range.property("ADBE Text Percent End").setValueAtTime(endT, 100);
        } else if (type === "scale_in") {
          var scaleProp = animator.property("ADBE Text Animator Properties").addProperty("ADBE Text Scale");
          scaleProp.setValue([0, 0]);
          var opacProp = animator.property("ADBE Text Animator Properties").addProperty("ADBE Text Opacity");
          opacProp.setValue(0);
          range.property("ADBE Text Percent End").setValueAtTime(startT, 0);
          range.property("ADBE Text Percent End").setValueAtTime(endT, 100);
        } else if (type === "blur_in") {
          var blurProp = animator.property("ADBE Text Animator Properties").addProperty("ADBE Text Blur");
          blurProp.setValue(20);
          var opacProp = animator.property("ADBE Text Animator Properties").addProperty("ADBE Text Opacity");
          opacProp.setValue(0);
          range.property("ADBE Text Percent End").setValueAtTime(startT, 0);
          range.property("ADBE Text Percent End").setValueAtTime(endT, 100);
        } else if (type === "slide_right") {
          var posProp = animator.property("ADBE Text Animator Properties").addProperty("ADBE Text Position");
          posProp.setValue([-100, 0]);
          var opacProp = animator.property("ADBE Text Animator Properties").addProperty("ADBE Text Opacity");
          opacProp.setValue(0);
          range.property("ADBE Text Percent End").setValueAtTime(startT, 0);
          range.property("ADBE Text Percent End").setValueAtTime(endT, 100);
        }

        app.endUndoGroup();
        return { success: true, type: type, startTime: startT, duration: dur };
      } catch(e) { try{app.endUndoGroup();}catch(ex){} return { success: false, error: e.toString() }; }
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
