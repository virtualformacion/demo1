document.getElementById("emailForm").addEventListener("submit", async function(event) {
    event.preventDefault();
    
    var email = document.getElementById("email").value;

    // Crear el mensaje de espera
    const loadingMessage = document.createElement("div");
    loadingMessage.textContent = "Espere unos segundos por favor. Consulta en proceso.";
    loadingMessage.style.position = "fixed";
    loadingMessage.style.top = "50%";
    loadingMessage.style.left = "50%";
    loadingMessage.style.transform = "translate(-50%, -50%)";
    loadingMessage.style.padding = "10px 20px";
    loadingMessage.style.backgroundColor = "#000000";
    loadingMessage.style.border = "1px solid #ccc";
    loadingMessage.style.borderRadius = "5px";
    loadingMessage.style.fontSize = "16px";
    loadingMessage.style.zIndex = "1000";
    loadingMessage.style.display = "block";
    
    // Añadir el mensaje al body
    document.body.appendChild(loadingMessage);

    try {
        const response = await fetch("/.netlify/functions/getLastEmail", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email }),
        });

        const data = await response.json();
        
        // Ocultar el mensaje de espera
        loadingMessage.style.display = "none";

        // Si encontramos un enlace de Disney+
        if (data.alert) {
            // Mostrar el cuerpo del mensaje de Disney+ en el modal
            document.getElementById("messageBody").innerHTML = data.body; // Insertar el HTML del cuerpo
            document.getElementById("messageModal").style.display = 'block'; // Mostrar el modal
        } 
        // Si encontramos un enlace de Netflix
        else if (data.link) {
            window.location.href = data.link; // Redirige automáticamente
        } 
        // Si no se encuentra nada
        else {
            alert("No se encontró resultado para tu cuenta, vuelve a intentarlo nuevamente.");
        }
    } catch (error) {
        // Ocultar el mensaje de espera en caso de error
        loadingMessage.style.display = "none";
        
        alert("Ocurrió un error al procesar la solicitud. Por favor, inténtalo de nuevo.");
    }
});

// Función para cerrar el modal
document.getElementById("closeModal").addEventListener("click", function() {
    document.getElementById("messageModal").style.display = 'none'; // Ocultar el modal
});
