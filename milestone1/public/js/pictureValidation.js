//separated this into another file since more than one file will use it; Might not be needed if we say image/*?
function validPicture(){
    
    if(!validType.exec(pic)){
        alert("Wrong file type. Please input a jpeg, jpg, or png file");
        picInput.value = '';
        return false;
    }
    else {
        return true;
    }
    
}


function submitPfp() {
			
    const form = document.getElementById('form');
    form.addEventListener('submit', (e) => {
        e.preventDefault();

<<<<<<< Updated upstream
=======
        const fname = document.getElementById('fname');
        const lname = document.getElementById('lname');
        const email = document.getElementById('email');
        const uname = document.getElementById('uname');
        const phone = document.getElementById('phone');
        const password = document.getElementById('password');
        const cpass = document.getElementById('cpass');
>>>>>>> Stashed changes
        const file = document.getElementById('file');

        const formData = new FormData();
        var fileData = file.files[0];
<<<<<<< Updated upstream
        formData.append("file", fileData);

        /*console.log(...formData); */

    fetch('http://127.0.0.1:4000/uploads', {
=======

        formData.append("fname", fname.value);
        formData.append("lname", lname.value);
        formData.append("email", email.value);
        formData.append("phone", phone.value);
        formData.append("uname", uname.value);
        formData.append("password", password.value);
        formData.append("cpass", cpass.value);
        formData.append("file", fileData);

        console.log(...formData);

    fetch('http://127.0.0.1:4000/users/register', {
>>>>>>> Stashed changes
        method: 'POST',
        body: formData,
    })
    .then (res => res.json())
    .then (data => console.log(data));

    })
}