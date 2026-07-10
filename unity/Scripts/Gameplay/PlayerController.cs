using UnityEngine;

namespace ChaosParcel.Gameplay
{
    /// <summary>
    /// Applies joystick input to a Rigidbody character.
    /// </summary>
    [RequireComponent(typeof(Rigidbody))]
    public class PlayerController : MonoBehaviour
    {
        [SerializeField] private float moveSpeed = 8f;
        [SerializeField] private float packageSlowMultiplier = 0.85f;
        [SerializeField] private Renderer bodyRenderer;

        private Rigidbody _rb;
        private Vector2 _input;
        private bool _frozen;
        private bool _confused;
        private bool _hasPackage;
        private string _playerId;

        public string PlayerId => _playerId;

        private void Awake()
        {
            _rb = GetComponent<Rigidbody>();
        }

        public void Initialize(string playerId, string nickname, Color color)
        {
            _playerId = playerId;
            if (bodyRenderer != null)
            {
                bodyRenderer.material.color = color;
            }
        }

        public void SetInput(float x, float y)
        {
            _input = new Vector2(x, y);
        }

        public void SetFrozen(bool frozen) => _frozen = frozen;
        public void SetConfused(bool confused) => _confused = confused;
        public void SetHasPackage(bool hasPackage) => _hasPackage = hasPackage;

        private void FixedUpdate()
        {
            if (_frozen) return;

            var input = _input;
            if (_confused)
            {
                input *= -1f;
            }

            var speed = _hasPackage ? moveSpeed * packageSlowMultiplier : moveSpeed;
            var move = new Vector3(input.x, 0f, input.y) * speed;
            _rb.velocity = new Vector3(move.x, _rb.velocity.y, move.z);
        }
    }
}
