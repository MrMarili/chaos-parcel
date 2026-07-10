using System;
using System.Collections.Generic;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using UnityEngine;
#if UNITY_WEBGL && !UNITY_EDITOR
using System.Runtime.InteropServices;
#endif

namespace ChaosParcel.Network
{
    /// <summary>
    /// WebSocket connection manager for Unity Host.
    /// Uses NativeWebSocket package (install via Package Manager or UPM git URL).
    /// </summary>
    public class NetworkManager : MonoBehaviour
    {
        public static NetworkManager Instance { get; private set; }

        [SerializeField] private string wsUrl = "ws://localhost:3001/ws?role=host";
        [SerializeField] private string hostVersion = "1.0.0";

        public event Action<string> OnRawMessage;
        public event Action OnConnected;
        public event Action OnDisconnected;

        private NativeWebSocket.WebSocket _socket;
        private readonly Queue<string> _mainThreadQueue = new();
        private bool _isConnected;

        public bool IsConnected => _isConnected;

        private void Awake()
        {
            if (Instance != null && Instance != this)
            {
                Destroy(gameObject);
                return;
            }
            Instance = this;
            DontDestroyOnLoad(gameObject);
        }

        private async void Start()
        {
            await ConnectAsync();
        }

        public async Task ConnectAsync()
        {
            if (_socket != null) return;

            _socket = new NativeWebSocket.WebSocket(wsUrl);

            _socket.OnOpen += () =>
            {
                _isConnected = true;
                EnqueueMain(() => OnConnected?.Invoke());
                SendRoomCreate();
            };

            _socket.OnMessage += (bytes) =>
            {
                var json = Encoding.UTF8.GetString(bytes);
                EnqueueMain(() => OnRawMessage?.Invoke(json));
            };

            _socket.OnClose += (_) =>
            {
                _isConnected = false;
                EnqueueMain(() => OnDisconnected?.Invoke());
            };

            _socket.OnError += (err) => Debug.LogError($"WebSocket error: {err}");

            await _socket.Connect();
        }

        private void Update()
        {
#if !UNITY_WEBGL || UNITY_EDITOR
            _socket?.DispatchMessageQueue();
#endif
            while (_mainThreadQueue.Count > 0)
            {
                _mainThreadQueue.Dequeue()?.Invoke();
            }
        }

        private void EnqueueMain(Action action)
        {
            lock (_mainThreadQueue)
            {
                _mainThreadQueue.Enqueue(action);
            }
        }

        public void SendRoomCreate()
        {
            var msg = $"{{\"event\":\"ROOM_CREATE\",\"payload\":{{\"host_version\":\"{hostVersion}\"}}}}";
            SendRaw(msg);
        }

        public void SendRaw(string json)
        {
            if (_socket == null || _socket.State != NativeWebSocket.WebSocketState.Open) return;
            _socket.SendText(json);
        }

        public async void Disconnect()
        {
            if (_socket != null)
            {
                await _socket.Close();
                _socket = null;
            }
        }

        private async void OnDestroy()
        {
            await (_socket?.Close() ?? Task.CompletedTask);
        }
    }
}
