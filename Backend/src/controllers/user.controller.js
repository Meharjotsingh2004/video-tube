import { ApiError } from "../utils/ApiError.js"
import { asyncHandler } from "../utils/asynchandler.js";
import { User } from "../models/user.model.js";
import { uploadOnCloudinary } from "../utils/cloudinary.js";
import { ApiResponse } from "../utils/ApiResponse.js"


const generateAccessAndRefreshTokens = async (userId) => {
    try {

        const user = await User.findById(userId);

        const accessToken = user.generateAccessToken();
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken;
        await user.save({ validateBeforeSave: false });

        return { accessToken, refreshToken };

    } catch (error) {
        throw new ApiError(500, "Something Went wrong while generating refresh and access token")
    }
}



const registerUser = asyncHandler(async (req, res) => {

    // steps for register user 
    // 1. get user details - (username, email, password, )
    // 2. validation - not empty
    // 3. check if user already exist : email and username
    // 4. check for images and check for avatar
    // 5. upload images to cludinary
    // 6. create user object and create entry in DB
    // 7. remove password and refreshToken from response 
    // 8. check for user creation
    // 9. return res
    const { username, email, fullName, password } = req.body;
    //console.log(req.body);

    if ([fullName, email, username, password].some((feild) =>
        feild?.trim() === "")) {
        throw new ApiError(400, "All Feilds are Required");
    }

    const existedUser = await User.findOne({
        $or: [{ username }, { email }]
    }).select("-password")


    console.log("existedUser : ", existedUser)

    if (existedUser) {
        throw new ApiError(409, "username or email aready exists")
    }

    //console.log("req.files" , req);

    const avatarLocalPath = req.files?.avatar[0]?.path;
    //const coverimageLocalPath = req.files?.coverimage[0].path;

    let coverimageLocalPath;

    if (req.files && Array.isArray(req.files.coverimage)
        && req.files.coverimage.length > 0) {
        coverimageLocalPath = req.files.coverimage[0].path;
    }

    if (!avatarLocalPath) {
        throw new ApiError(400, "avatar file is Required")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath);
    const coverimage = await uploadOnCloudinary(coverimageLocalPath);

    if (!avatar) {
        throw new ApiError(400, "Avatar file is required");
    }

    const user = await User.create({
        fullName, email,
        avatar: avatar.url,
        coverimage: coverimage?.url || "",
        username: username.toLowerCase(),
        password
    })
    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    );

    if (!createdUser) {
        throw new ApiError(500, "something went wrong while registering user")
    }

    return res.status(201).json(
        new ApiResponse(200, createdUser, "user registered successfully")
    )



})



const loginUser = asyncHandler(async (req, res) => {

    // steps for login user
    // 1. get user deatils from req.body
    // 2. validate if (username or email) exists
    // 3. find the user
    // 4. check password ? give access : "wrong password"
    // 5. access and refresh token generation
    // 6. send cookie


    const { email, username, password } = req.body;

    if (!username || !email) {
        throw new ApiError(400, "username or email is required");
    }

    const user = await User.findOne({
        $or: [{ username }, { email }]
    })

    if (!user) {
        throw new ApiError(404, "User does not Exists")
    }

    const isPasswordValid = await user.isPasswordCorrect(password);

    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid user credentials");
    }

    const { accessToken, refreshToken } = await generateAccessAndRefreshTokens(user._id);

    const loggedInUser = User.findById(user._id).select("-password -refreshToken")

    const option = {
        httpOnly: true,
        secure: true
    }
    res.status(200)
        .cookie("accessToken", accessToken, option)
        .cookie("refreshToken", refreshToken, option)
        .json(new ApiResponse(200,
            {
                user: loggedInUser, accessToken, refreshToken
            },
            "User logged In Successfully"
        ))


});


const logoutUser = asyncHandler(async (req, res) => {



    await User.findById(req.user._id, {
        $set: {
            refreshToken: undefined
        }
    }, {
        new: true
    })

    const option = {
        httpOnly: true,
        secure: true
    }

    return res.status(200).clearCookie("accessToken" , option)
    .clearCookie("refreshToken" , option)
    .json(new ApiResponse(200, {}, "User Logged Out"))
})


export {
    registerUser,
    loginUser, logoutUser
} 