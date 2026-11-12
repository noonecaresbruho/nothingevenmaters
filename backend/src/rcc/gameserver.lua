-- Minimal 2016 game server script, run by RCCService via SOAP OpenJobEx.
-- Arguments: placeId, port, baseUrl (e.g. "http://localhost")
local placeId, port, baseUrl = ...
placeId = tonumber(placeId)
port = tonumber(port)

pcall(function() game:GetService("ContentProvider"):SetBaseUrl(baseUrl .. "/") end)
pcall(function() settings().Diagnostics:LegacyScriptMode() end)

local scriptContext = game:GetService("ScriptContext")
scriptContext.ScriptsDisabled = true

game:SetPlaceID(placeId, false)
pcall(function() game:GetService("ChangeHistoryService"):SetEnabled(false) end)

local ns = game:GetService("NetworkServer")
pcall(function() ns:SetIsPlayerAuthenticationRequired(false) end)

-- RCC refuses http place loads, so the backend copies places into rcc/content/places.
game:Load("rbxasset://places/place_" .. placeId .. ".rbxl")

-- Forward server output (F9 "Server" tab) to the backend, which writes logs/server.log
pcall(function()
	game:GetService("LogService").MessageOut:connect(function(msg, msgType)
		spawn(function()
			pcall(function()
				local line = game:GetService("HttpService"):UrlEncode(tostring(msgType) .. " " .. msg)
				game:HttpGet(baseUrl .. "/rcc/log?m=" .. line)
			end)
		end)
	end)
end)

-- Make sure every player gets a character, even if the place turned auto-loading off.
local Players = game:GetService("Players")
print("[gameserver] CharacterAutoLoads = " .. tostring(Players.CharacterAutoLoads))
Players.PlayerAdded:connect(function(player)
	print("[gameserver] player added: " .. player.Name .. " (" .. player.userId .. ")")
	delay(5, function()
		if player.Parent and not player.Character then
			print("[gameserver] no character after 5s, calling LoadCharacter for " .. player.Name)
			local ok, err = pcall(function() player:LoadCharacter() end)
			if not ok then print("[gameserver] LoadCharacter failed: " .. tostring(err)) end
		end
	end)
	player.CharacterAdded:connect(function(c)
		print("[gameserver] character spawned for " .. player.Name)
		-- Older places wait for the legacy core "HealthGUI" in PlayerGui (removed from Roblox before 2016).
		local pg = player:WaitForChild("PlayerGui")
		if not pg:FindFirstChild("HealthGUI") then
			local g = Instance.new("ScreenGui")
			g.Name = "HealthGUI"
			g.Parent = pg
		end
	end)
end)

ns:Start(port)
scriptContext.ScriptsDisabled = false
game:GetService("RunService"):Run()
print("[gameserver] place " .. placeId .. " running on port " .. port)
