-- Roblox AI Agent local plugin. No generated code is executed by this plugin.
local Http = game:GetService("HttpService")
local Editor = game:GetService("ScriptEditorService")
local History = game:GetService("ChangeHistoryService")
local Run = game:GetService("RunService")
local Selection = game:GetService("Selection")
local ROOTS = {"Workspace", "ReplicatedStorage", "ServerScriptService", "ServerStorage", "StarterGui", "StarterPlayer"}
local CLASSES = {Folder=true, Model=true, Part=true, SpawnLocation=true, Script=true, LocalScript=true, ModuleScript=true, ScreenGui=true, Frame=true, TextLabel=true, TextButton=true}
local BASE = "http://127.0.0.1:3001/api"
local sessionId = Http:GenerateGUID(false)
local connected, running = false, true
local pending, resultToSend = nil, nil
local busy = false
local toolbar = plugin:CreateToolbar("Studio Agent")
local toggle = toolbar:CreateButton("Studio Agent", "Conectar ao agente de IA local", "")
local widget = plugin:CreateDockWidgetPluginGui("RobloxAIAgentBridge", DockWidgetPluginGuiInfo.new(Enum.InitialDockState.Right, false, false, 420, 560, 320, 400))
widget.Title = "Roblox AI Agent"
local background = Instance.new("Frame")
background.Size = UDim2.fromScale(1, 1)
background.BackgroundColor3 = Color3.fromRGB(20, 23, 32)
background.Parent = widget
local layout = Instance.new("UIListLayout")
layout.Padding = UDim.new(0, 10)
layout.Parent = background
local padding = Instance.new("UIPadding")
padding.PaddingTop = UDim.new(0, 14)
padding.PaddingLeft = UDim.new(0, 12)
padding.PaddingRight = UDim.new(0, 12)
padding.Parent = background
local function control(class, height, text)
 local item = Instance.new(class)
 item.Size = UDim2.new(1, 0, 0, height)
 item.BackgroundColor3 = Color3.fromRGB(34, 39, 52)
 item.TextColor3 = Color3.fromRGB(235, 238, 250)
 item.Font = Enum.Font.Code
 item.TextSize = 14
 item.Text = text
 item.TextWrapped = true
 item.Parent = background
 return item
end
control("TextLabel", 44, "STUDIO AGENT • conexão local\nRevise o código no painel antes de aprovar.")
local tokenBox = control("TextBox", 44, "")
tokenBox.PlaceholderText = "Cole o token local (não a chave do provider)"
tokenBox.ClearTextOnFocus = false
local connectButton = control("TextButton", 36, "Conectar / desconectar")
local status = control("TextLabel", 74, "Desconectado. Inicie o aplicativo local.")
local shareSource = control("TextButton", 36, "Compartilhar código dos scripts: NÃO")
local preview = control("TextLabel", 130, "Nenhuma proposta pendente.")
preview.TextXAlignment = Enum.TextXAlignment.Left
preview.TextYAlignment = Enum.TextYAlignment.Top
local apply = control("TextButton", 36, "Confirmar alterações no Studio")
local reject = control("TextButton", 36, "Recusar proposta")
local includeSource = false
shareSource.MouseButton1Click:Connect(function()
 includeSource = not includeSource
 shareSource.Text = "Compartilhar código dos scripts: " .. (includeSource and "SIM" or "NÃO")
end)
toggle.Click:Connect(function() widget.Enabled = not widget.Enabled end)
local function request(path, method, body)
 local headers = {Authorization = "Bearer " .. tokenBox.Text, ["Content-Type"] = "application/json"}
 local response = Http:RequestAsync({Url=BASE .. path, Method=method or "GET", Headers=headers, Body=body and Http:JSONEncode(body) or nil})
 if not response.Success then error("Servidor HTTP " .. response.StatusCode .. ". Confira o token e o servidor local.") end
 return Http:JSONDecode(response.Body)
end
local function objectPath(object)
 local path, current = {}, object
 while current and current ~= game do
  table.insert(path, 1, current.Name)
  current = current.Parent
 end
 return path
end
local function key(path) return Http:JSONEncode(path) end
local function root(name)
 for _, allowed in ipairs(ROOTS) do if allowed == name then return game:GetService(name) end end
 error("Serviço não permitido")
end
local function find(path, parentOnly)
 local current = root(path[1])
 for i = 2, #path - (parentOnly and 1 or 0) do
  local found = nil
  for _, child in ipairs(current:GetChildren()) do
   if child.Name == path[i] then
    if found then error("Caminho ambíguo: " .. table.concat(path, "/")) end
    found = child
   end
  end
  if not found then return nil end
  current = found
 end
 return current
end
local function getSource(object)
 return Editor:GetEditorSource(object)
end
local function readProperty(object, name)
 if name == "Size" or name == "Position" then local v = object[name]; return {v.X, v.Y, v.Z} end
 if name == "Color" then local c = object.Color; return {c.R, c.G, c.B} end
 return object[name]
end
local function setProperty(object, name, value)
 if name == "Size" or name == "Position" then object[name] = Vector3.new(value[1], value[2], value[3])
 elseif name == "Color" then object.Color = Color3.new(value[1], value[2], value[3])
 else object[name] = value end
end
local function scan()
 local items, truncated, sourceBytes = {}, false, 0
 local function visit(parent, depth)
  if depth > 10 then if #parent:GetChildren() > 0 then truncated = true end; return end
  for _, object in ipairs(parent:GetChildren()) do
   if #items >= 300 then truncated = true; return end
   local item = {path=objectPath(object), className=object.ClassName}
   if object:IsA("LuaSourceContainer") and includeSource then
    local ok, source = pcall(getSource, object)
    if ok and #source <= 100000 and sourceBytes + #source < 800000 then item.source = source; sourceBytes += #source
    else truncated = true end
   end
   table.insert(items, item)
   visit(object, depth + 1)
  end
 end
 for _, name in ipairs(ROOTS) do visit(root(name), 1) end
 return {sessionId=sessionId, placeName=game.Name, placeId=game.PlaceId, items=items, truncated=truncated}
end
local function capture(job)
 local baseline = {}
 for _, op in ipairs(job.proposal.operations) do
  local object = find(op.path)
  local entry = {object=object, properties={}}
  if object then
   if object.ClassName ~= op.className then error("Classe incompatível: " .. table.concat(op.path, "/")) end
   if op.source ~= nil then entry.source = getSource(object) end
   for name in pairs(op.properties) do entry.properties[name] = readProperty(object, name) end
  end
  baseline[key(op.path)] = entry
 end
 return baseline
end
local function validate(job)
 assert(job.context.sessionId == sessionId, "Sessão diferente")
 assert(type(job.proposal.operations) == "table" and #job.proposal.operations <= 60, "Operações inválidas")
 local known = {}
 for _, item in ipairs(job.context.items) do known[key(item.path)] = item end
 local seen = {}
 for _, op in ipairs(job.proposal.operations) do
  assert(CLASSES[op.className], "Classe não permitida")
  assert(type(op.path) == "table" and #op.path >= 2 and #op.path <= 12, "Caminho inválido")
  root(op.path[1])
  for _, name in ipairs(op.path) do assert(type(name) == "string" and #name > 0 and not string.find(name, "[/\\%c]") and name ~= "." and name ~= "..", "Nome inválido") end
  assert(not seen[key(op.path)], "Caminho duplicado")
  seen[key(op.path)] = true
  local object = find(op.path)
  local previous = known[key(op.path)]
  if object then
   assert(previous and previous.className == object.ClassName and object.ClassName == op.className, "Objeto novo ou classe alterada desde a geração")
   if op.source ~= nil then assert(previous.source ~= nil and getSource(object) == previous.source, "Script sem contexto de código ou alterado. Ative compartilhar código e gere outra proposta.") end
  else assert(not previous, "Objeto removido desde a geração") end
  for name in pairs(op.properties) do
   local part = op.className == "Part" or op.className == "SpawnLocation"
   local gui = op.className == "TextLabel" or op.className == "TextButton"
   assert((part and ({Anchored=true, CanCollide=true, Size=true, Position=true, Color=true, Transparency=true})[name]) or (gui and name == "Text"), "Propriedade não permitida")
  end
  assert((op.source ~= nil) == (op.className == "Script" or op.className == "LocalScript" or op.className == "ModuleScript"), "Source inválido")
 end
end
local function applyJob(job)
 assert(not Run:IsRunning(), "Pare o modo Play antes de aplicar")
 validate(job)
 local baseline = job.baseline
 local planned, targets, created, undo = {}, {}, {}, {}
 for _, op in ipairs(job.proposal.operations) do
  local entry = baseline[key(op.path)]
  assert(entry and find(op.path) == entry.object, "Objeto alterado após a revisão")
  local object = entry.object
  if object then
   for name, old in pairs(entry.properties) do assert(Http:JSONEncode(readProperty(object, name)) == Http:JSONEncode(old), "Propriedade alterada após a revisão") end
   if op.source then assert(getSource(object) == entry.source, "Script alterado após revisão") end
  else
   local parentPath = table.clone(op.path); table.remove(parentPath)
   assert(find(parentPath) or planned[key(parentPath)], "Crie o pai antes do filho")
  end
  planned[key(op.path)] = true
 end
 local recording = History:TryBeginRecording("RobloxAIAgent", "Aplicar proposta de IA")
 assert(recording, "Não foi possível iniciar histórico. Salve o projeto e tente novamente.")
 local ok, failure = pcall(function()
  for _, op in ipairs(job.proposal.operations) do
   local object = find(op.path)
   if not object then
    object = Instance.new(op.className)
    table.insert(created, object)
    object.Name = op.path[#op.path]
    object.Parent = assert(find(op.path, true), "Pai não encontrado")
   else
    local old = {object=object, properties={}, source=op.source and getSource(object) or nil}
    for name in pairs(op.properties) do old.properties[name] = readProperty(object, name) end
    table.insert(undo, old)
   end
   if op.source ~= nil then
    local expected = getSource(object)
    local conflict = false
    Editor:UpdateSourceAsync(object, function(current)
     if current ~= expected then conflict = true; return nil end
     return op.source
    end)
    assert(not conflict, "Conflito de edição de script")
   end
   for name, value in pairs(op.properties) do setProperty(object, name, value) end
   table.insert(targets, object)
  end
 end)
 if not ok then
  local rollbackOk = true
  for i = #undo, 1, -1 do
   local restored = pcall(function()
    local old = undo[i]
    if old.source ~= nil then Editor:UpdateSourceAsync(old.object, function() return old.source end) end
    for name, value in pairs(old.properties) do setProperty(old.object, name, value) end
   end)
   if not restored then rollbackOk = false end
  end
  for i = #created, 1, -1 do if not pcall(function() created[i]:Destroy() end) then rollbackOk = false end end
  History:FinishRecording(recording, Enum.FinishRecordingOperation.Commit)
  error(tostring(failure) .. (rollbackOk and " • alterações revertidas" or " • reversão parcial; use Desfazer e confira o projeto"))
 end
 History:FinishRecording(recording, Enum.FinishRecordingOperation.Commit)
 Selection:Set(targets)
end
local function finish(resultStatus, message)
 resultToSend = {id=pending.id, sessionId=sessionId, status=resultStatus, message=string.sub(message, 1, 4000)}
 pending = nil
 preview.Text = message
end
apply.MouseButton1Click:Connect(function()
 if not pending or busy or resultToSend then return end
 busy = true
 local ok, err = pcall(applyJob, pending)
 if ok then finish("applied", "Alterações aplicadas. Teste no Play e confira Script Analysis. Use Desfazer para reverter.")
 else finish("failed", tostring(err)) end
 busy = false
end)
reject.MouseButton1Click:Connect(function()
 if pending and not busy then finish("cancelled", "Proposta recusada no Studio") end
end)
connectButton.MouseButton1Click:Connect(function()
 if busy then return end
 if connected then connected = false; status.Text = "Desconectado"; return end
 if #tokenBox.Text ~= 64 then status.Text = "Cole o token local de 64 caracteres"; return end
 connected = true
 status.Text = "Conectando… Autorize acesso HTTP ao localhost se o Studio solicitar."
end)
task.spawn(function()
 while running do
  if connected and not busy then
   local ok, err = pcall(function()
    if resultToSend then request("/studio/result", "POST", resultToSend); resultToSend = nil end
    request("/studio/context", "POST", scan())
    status.Text = "Conectado • " .. game.Name .. "\nCódigo compartilhado: " .. (includeSource and "sim" or "não")
    if not pending then
     local job = request("/studio/job?sessionId=" .. sessionId)
     if job then
      local valid, reason = pcall(function() validate(job); job.baseline = capture(job) end)
      pending = job
      if not valid then finish("failed", tostring(reason))
      else preview.Text = string.sub(job.proposal.summary, 1, 500) .. "\n" .. #job.proposal.operations .. " alterações. Revise no painel e confirme aqui."; widget.Enabled = true end
     end
    end
   end)
   if not ok then status.Text = string.sub(tostring(err), 1, 300) end
  end
  task.wait(5)
 end
end)
plugin.Unloading:Connect(function() running = false; connected = false end)
