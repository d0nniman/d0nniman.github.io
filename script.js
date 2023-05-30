function showImage(id) {
    var images = ['food-menu', 'drinks-menu', 'takeaway-menu'];
  
    for (var i = 0; i < images.length; i++) {
      var image = document.getElementById(images[i]);
      if (images[i] === id) {
        image.style.display = 'block';
      } else {
        image.style.display = 'none';
      }
    }
  }