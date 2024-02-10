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

        const file = document.getElementById('file');

        const formData = new FormData();
        var fileData = file.files[0];
        formData.append("file", fileData);

        /*console.log(...formData); */

    fetch('http://127.0.0.1:4000/uploads', {
        method: 'POST',
        body: formData,
    })
    .then (res => res.json())
    .then (data => console.log(data));

    })
}