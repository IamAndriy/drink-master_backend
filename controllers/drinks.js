const { User } = require('../db/models/user'); 
const { Recipe } = require('../db/models/recipe');
const { httpError, ctrlWrapper} = require('../helpers/');
const { mongoose } = require("mongoose");
const {differenceInYears} = require('date-fns')


//------ КОНТРОЛЛЕРИ ДЛЯ РОБОТИ ІЗ КОЛЛЕКЦІЄЮ RECIPES ( для маршрута /drinks) ----------------------------

// контроллери для GET-запитів

  // + отримання масиву напоїв id для поточного(залогіненого) юзера
   
const getDrinksForMainPage = async (req, res) => {
  const userBirthDate = req.user.birthdate;
  const currentDate = new Date();
  const ageFilter = differenceInYears(currentDate, userBirthDate) >= 18;

  const categories = ['Ordinary Drink', 'Cocktail', 'Shake', 'Other/Unknown'];

  const drinksForMainPage = {};

  for (const category of categories) {
    let cocktails = [];

    if (category === 'Other/Unknown') {
      const uniqueCategories = categories.filter(cat => cat !== 'Other/Unknown');
      const uniqueCocktails = new Set();

      while (uniqueCocktails.size < 3) {
        const randomCategory = uniqueCategories[Math.floor(Math.random() * uniqueCategories.length)];
        const randomCocktail = await Recipe.aggregate([
          { $match: { category: randomCategory, alcoholic: ageFilter ? 'Alcoholic' : 'Non alcoholic' } },
          { $sample: { size: 1 } },
          { $project: { _id: 1, drink: 1, drinkThumb: 1, alcoholic: 1 } }
        ]);
        uniqueCocktails.add(randomCocktail[0]);
      }

      cocktails = Array.from(uniqueCocktails);
    } else {
      // Adjusted the condition to include both alcoholic and non-alcoholic for users 18 or older
      cocktails = await Recipe.aggregate([
        { $match: { category, alcoholic: ageFilter ? { $in: ['Alcoholic', 'Non alcoholic'] } : 'Non alcoholic' } },
        { $sample: { size: 3 } },
        { $project: { _id: 1, drink: 1, drinkThumb: 1, alcoholic: 1 } }
      ]);
    }

    drinksForMainPage[category] = cocktails;
  }

  res.json({ user: { birthDate: userBirthDate }, drinksForMainPage });
};



  //+отримання всіх напоїв поточного(залогіненого) юзера
    const getAllDrinks = async(req, res)=>{ 
      console.log("req.user=", req.user);
      const {id: owner} = req.user;
      const filter = {owner};
      const result = await Recipe.find(filter, {id:1, drink:1, category:1, alcoholic:1, glass:1, description:1, instructions:1, drinkThumb:1, ingredients:1});
      res.json(result);
    }
    
  //+ отримання популярних напоїв:

const getPopularDrinks = async (req, res) => {
  try {
    const userBirthDate = req.user.birthdate;
    const currentDate = new Date();
    const ageFilter = differenceInYears(currentDate, userBirthDate) >= 18;

    const userId = req.user._id;

    const user = await User.findById(userId);
    if (!user || !user.favorites || user.favorites.length === 0) {
      const randomDrinks = await Recipe.aggregate([
        { $sample: { size: 9 } },
        {
          $project: { _id: 0, drink: 1, drinkThumb: 1, alcoholic: ageFilter ? 'Alcoholic' : 'Non alcoholic' }
        } 
      ]);

      res.status(200).json(randomDrinks);
    } else {
      const userFavorites = user.favorites;
      const favoriteCocktail = await Recipe.findById(userFavorites[0]);
      const category = favoriteCocktail.category;
      const favoriteIngredients = favoriteCocktail.ingredients.map((ingredient) => ingredient.title);

      const similarDrinks = await Recipe.find({
        category: category,
        'ingredients.title': { $in: favoriteIngredients },
        _id: { $nin: userFavorites },
        alcoholic: ageFilter ? { $in: ['Alcoholic', 'Non alcoholic'] } : 'Non alcoholic',
      })
        .limit(9)
        .select('-_id drink drinkThumb alcoholic'); 

      res.status(200).json(similarDrinks);
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Помилка при отриманні популярних коктейлів' });
  }
};

  //+ пошук напоїв за категорією + інгредієнтам + ключовим словом

const searchDrinks = async (req, res) => {
  try {
    const userBirthDate = req.user.birthdate;
    const currentDate = new Date();
    const ageFilter = differenceInYears(currentDate, userBirthDate) >= 18;

    const { category, ingredient, keyword, page, per_page } = req.query;

    const currentPage = parseInt(page) || 1;
    const limit = parseInt(per_page) || 10;
    const skip = (currentPage - 1) * limit;

    const alcoholicFilter = ageFilter ? { $in: ['Alcoholic', 'Non alcoholic'] } : 'Non alcoholic';

    const query = {
      $and: [
        category ? { category } : {},
        ingredient ? { 'ingredients.title': { $regex: ingredient, $options: 'i' } } : {},
        keyword ? {
          $or: [
            { drink: { $regex: keyword.replace(' ', '[^\S]'), $options: 'i' } },
            { instructions: { $regex: keyword.replace(' ', '[^\S]'), $options: 'i' } },
            { 'ingredients.title': { $regex: keyword.replace(' ', '[^\S]'), $options: 'i' } },
          ],
        } : {},
        { alcoholic: alcoholicFilter },
      ],
    };

    const totalResults = await Recipe.countDocuments(query);

    const drinks = await Recipe.find(query)
      .skip(skip)
      .limit(limit)
      .select('_id drink alcoholic drinkThumb category instructions description shortDescription ingredients.title');

    res.status(200).json({ drinks, totalResults });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Помилка при пошуку коктейлів' });
  }
};

  //+ отримання всіх напоїв поточного(залогіненого) юзера, які додані у favorits
    const getFavoriteDrinks = async (req, res) => {
      const { _id: userId } = req.user;
      const { page, per_page } = req.query;
      const currentPage = parseInt(page) && 1;
      const limit = parseInt(per_page) && 10;
      const skip = (currentPage - 1) * limit;

      try {
        const result = await Recipe.find(
          { users: { $in: [userId] } },
          { id: 1, drink: 1, category: 1, alcoholic: 1, glass: 1, description: 1, shortDescription: 1, instructions: 1, drinkThumb: 1, ingredients: 1 }
        )
          .skip(skip)
          .limit(limit);
        res.json(result);
      } catch (error) {
        res.status(500).json({ error: 'Internal Server Error' });
      }
    };

  //+ отримання напою за йього _id для поточного(залогіненого) юзера
    const getDrinkById = async (req, res) => {
      const {id} = req.params;
      const result = await Recipe.findById(id, {drink:1, category:1, alcoholic:1, glass:1, description:1, shortDescription:1, instructions:1, drinkThumb:1, ingredients:1});
      if (!result) { throw httpError(404, "Not found"); }
      res.json(result);
    }

// контроллери для POST-запитів

  //+ додавання напою поточним(залогіненим) юзером
    const addDrink = async (req, res) => {
      const {_id: owner} = req.user;
      const {ingredients} = req.body;    //забираємо з body строку ingredients, тому що нам треба її распарсити у JSON-формат, та фотку напоя
    //  const {drinkImage} = req.file;      //!!!! drinkImage - домовитися в фронтендом, як однаково назвати
      const drinkThumb = req.file.path;


      // !!!!перевірити чи правильно розпарсюэться ingredients, в якому вигляді воно прийде з фронтенду
      const ingredientsJSON =  JSON.parse(ingredients).map(({title, measure="", ingredientId})=>{
          const _id = new mongoose.Types.ObjectId(ingredientId);
          return {title, measure, ingredientId: _id }; 
        });

        const result = await Recipe.create({
              ...req.body,
              ingredients : ingredientsJSON, 
              drinkThumb, 
              owner
            }
          );    

      //if (!result) { throw httpError(400, `Drink with the name '${req.body.drink}' is elready in the list`); } // не можна додавати напої з однаковими назвами, схема валідації не пропустить
      res.status(201).json(result);
    } 
    
    
    // const addDrink = async (req, res) => {
    // console.log(req.user);
    // const {_id: owner} = req.user;
        
    // const result = await Recipe.create({...req.body, owner});    

    // if (!result) { throw httpError(400, `Drink with the name '${req.body.drink}' is elready in the list`); } // не можна додавати напої з однаковими назвами
    // res.status(201).json(result);
  

  //+ додавання напоя в favorits для поточного(залогіненого) юзера
    const addDrinkToFavorite = async (req, res) => {
    const { id } = req.params;     // забираємо з body id паною  
    const { _id: userId } = req.user;
    
    const drink = await Recipe.findById(id);

    if (!drink) {
      throw httpError(404, "Not Found");
    }

    if (!drink.users) {
      drink.users = [];
    }

    const isFavorite = drink.users.includes(userId);

    let result;

    if (isFavorite) {
      throw httpError(409, `${drink.drink} is already in your favorites.`);
    } else {
      result = await Recipe.findByIdAndUpdate(
        drink._id, 
        { $push: { users: userId } },
        { new: true },
      );
    }

    res.status(201).json(result);
  }


// контроллери для DELETE-запитів

  //+ видалення напою поточним(залогіненим) юзером
    const deleteDrinkById = async (req, res) => {
      const {id} = req.params;
      const result = await Recipe.findByIdAndDelete({_id: id});
      if (!result) { throw httpError(404, "Not found"); }
      res.json({ message : "drink deleted" });
    } 
      
  //+ видалення напоя із favorits для поточного(залогіненого) юзера
    const removeDrinkFromFavorite = async (req, res) => {
        const { id } = req.params;
        const { _id: userId } = req.user;

        const drink = await Recipe.findById(id);

        if (!drink) {
          throw httpError(404, "Not Found");
        }

        const isFavorite = drink.users ? drink.users.includes(userId) : true;

        let result;

        if (isFavorite) {
          result = await Recipe.findByIdAndUpdate(
            drink._id,
            {
              $pull: { users: userId },
            },
            { new: true }
          );
        } else {
          throw httpError(403, `${drink.drink} is not in your favorites.`);
        }

        res.json(result);
    };
  


//---------------------------------------------------------------------------------------------------------

module.exports = {
  getDrinksForMainPage : ctrlWrapper(getDrinksForMainPage),
  getPopularDrinks : ctrlWrapper(getPopularDrinks),
  searchDrinks : ctrlWrapper(searchDrinks),
  getDrinkById : ctrlWrapper(getDrinkById),
  addDrink : ctrlWrapper(addDrink),
  deleteDrinkById : ctrlWrapper(deleteDrinkById),
  getAllDrinks : ctrlWrapper(getAllDrinks),
  addDrinkToFavorite : ctrlWrapper(addDrinkToFavorite),
  removeDrinkFromFavorite : ctrlWrapper(removeDrinkFromFavorite),
  getFavoriteDrinks : ctrlWrapper(getFavoriteDrinks),
}
